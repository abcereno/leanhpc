// src/utils/auditEngine.js

/**
 * Analyzes raw credit report data (SmartCredit or IDIQ/TuLink).
 */
export function runAuditEngine(rawData) {
  if (!rawData) return null;

  // 1. NORMALIZE & LOCATE BUNDLE
  let root = rawData.report || rawData;
  // Handle IDIQ wrapping
  let bundle = root.BundleComponents || root.bundleComponents;

  if (!bundle) {
      const preNorm = normalizeRecursive(root);
      bundle = preNorm.BundleComponents || preNorm.bundleComponents;
  }
  
  if (!bundle) {
      console.warn("AuditEngine: No BundleComponents found.");
      return emptyAudit();
  }

  // 2. NORMALIZE TO COMMON FORMAT
  const components = normalizeList(bundle.BundleComponent).map(c => normalizeRecursive(c));
  
  let audit = emptyAudit();
  
  // 3. SOURCE DETECTION (robust)
  // Use the normalized root (bundle) and components to infer source instead of relying
  // on fragile flags. This lets runAuditEngine accept either SmartCredit wrappers,
  // raw MergeCreditReports (IdentityIQ), or other provider formats that include
  // BundleComponents / TrueLinkCreditReportType structures.
  const rootHasBundle = Boolean((root && (root.BundleComponents || root.bundleComponents)) || components.length > 0);
  const hasTrueLink = Boolean(components.find(c => c.TrueLinkCreditReportType) || (root && (root.TrueLinkCreditReportType || root.FraudIndicator !== undefined)));

  if (root && rawData && rawData.success !== undefined) {
      audit.meta.source = 'SmartCredit';
  } else if (hasTrueLink || rootHasBundle) {
      audit.meta.source = 'IdentityIQ';
  } else {
      audit.meta.source = 'Unknown';
  }

  // 4. FIND REPORT DATA
  const mergeComp = components.find(c => c.TrueLinkCreditReportType || c.creditReport);

  try {
// 5. PARSE SCORES & AUDIT SAFETY TRAPS
      let bankruptcyDetectedViaFactors = false;

      components.forEach(c => {
         if (c.CreditScoreType) {
             const type = (getValue(c.Type) || "").toUpperCase();
             const val = parseInt(getValue(c.CreditScoreType.riskScore) || 0);
             
             if (val > 0) {
                if (type.includes("EXP") || type.includes("EXPERIAN") || type.includes("XPN")) audit.scores.EX = val;
                else if (type.includes("TUC") || type.includes("TRANSUNION") || type.includes("TU")) audit.scores.TU = val;
                else if (type.includes("EQF") || type.includes("EQUIFAX") || type.includes("EQ")) audit.scores.EQ = val;
             }

             // 👇 NEW SAFETY WEAVE: Intercept hidden bankruptcies via factor code 98 👇
             if (c.CreditScoreType.CreditScoreFactor) {
                 const factors = normalizeList(c.CreditScoreType.CreditScoreFactor);
                 const hasBkCode = factors.some(f => String(getValue(f.bureauCode)) === "98");
                 if (hasBkCode) {
                     bankruptcyDetectedViaFactors = true;
                 }
             }
         }
      });

      // 6. PARSE MERGE REPORT
      if (mergeComp) {
          const reportBody = mergeComp.TrueLinkCreditReportType || mergeComp.creditReport;
          if (reportBody) {
              parseMergeReport(reportBody, audit);
          }
      }

      // 👇 NEW BACKUP RULE: Force-inject record if bankruptcy is hiding in the factors 👇
      if (bankruptcyDetectedViaFactors && audit.public_records.length === 0) {
          const bkFallbackItem = {
              type: "Bankruptcy Chapter 7 or 13 (Derived)",
              bureau: "EX, TU",
              date_filed: "Unspecified",
              reference_number: "See Factor Code 98",
              amount: 0,
              status: "Active Discrepancy Signal"
          };
          
          audit.public_records.push(bkFallbackItem);
          
          audit.negatives.push({
              category: 'PUBLIC_RECORD',
              name: 'Bankruptcy (Detected via Risk Factors)',
              account: 'Bankruptcy',
              account_name: 'Bankruptcy',
              bureau: 'EX, TU',
              detail: 'Bankruptcy flagged directly by credit scoring model factors.',
              reason: 'Prior Bankruptcy Record',
              date: 'Unspecified',
              balance: 0,
              severity: 'High',
              action: 'Verify Status / Dispute'
          });
      }

// 7. SMART CONSOLIDATION
      audit.accounts = consolidateAccounts(audit.accounts);
      audit.inquiries = consolidateInquiries(audit.inquiries);
      audit.negatives = consolidateNegatives(audit.negatives);

      // 👇 CORRECTION: Compute global metrics AFTER consolidation to fix the tripling bug! 👇
      audit.summary.total_revolving_limit = 0;
      audit.summary.total_revolving_debt = 0;
      audit.summary.open_accounts = 0;
      audit.summary.total_debt = 0;

      audit.accounts.forEach(acc => {
          const isOpen = acc.status?.toLowerCase()?.includes('open') || acc.account_status?.toLowerCase() === 'open';
          
          if (isOpen) {
              audit.summary.open_accounts++;
              audit.summary.total_debt += acc.balance;

              if (acc.is_revolving && acc.limit > 0) {
                  audit.summary.total_revolving_limit += acc.limit;
                  audit.summary.total_revolving_debt += acc.balance;
              }
          }
      });

      // 8. FINAL SUMMARIES
      audit.summary.negatives_count = audit.negatives.length;
      audit.summary.total_accounts = audit.accounts.length;
      
      if (audit.summary.total_revolving_limit > 0) {
        audit.summary.utilization_pct = Math.round((audit.summary.total_revolving_debt / audit.summary.total_revolving_limit) * 100);
        audit.summary.total_available = audit.summary.total_revolving_limit - audit.summary.total_revolving_debt;
      }

      ['EX', 'TU', 'EQ'].forEach(b => {
          const limit = audit.bureau_stats[b].revolving_limit;
          const debt = audit.bureau_stats[b].revolving_debt;
          if (limit > 0) {
              audit.bureau_stats[b].utilization_pct = Math.round((debt / limit) * 100);
          }
      });

      return audit;

  } catch (err) {
      console.error("Audit Engine Crash:", err);
      return audit; 
  }
}

// --- HELPERS ---

function consolidateAccounts(accounts) {
    const merged = [];
    accounts.forEach(acc => {
        const cleanNum = (acc.account_num || "").replace(/[^0-9]/g, '');
        const normName = normalizeName(acc.name);

        const match = merged.find(m => {
            const mClean = (m.account_num || "").replace(/[^0-9]/g, '');
            const mName = normalizeName(m.name);
            const numMatch = (cleanNum.length > 3 && mClean.length > 3) && (cleanNum.includes(mClean) || mClean.includes(cleanNum));
            const nameMatch = normName === mName || (normName && mName && (normName.includes(mName) || mName.includes(normName)));

            if (numMatch) return true;
            if (nameMatch && (cleanNum.length < 4 || mClean.length < 4)) return true; 
            return false;
        });

        if (match) {
            // 👇 FIX #2: Rewrite the string so your UI displays all bureaus! 👇
            if (!match.bureaus.includes(acc.bureau)) {
                match.bureaus.push(acc.bureau);
                match.bureau = match.bureaus.join(', '); // Turns "TU" into "TU, EX, EQ"
            }
            if (cleanNum.length > (match.account_num || "").replace(/[^0-9]/g, '').length) {
                match.account_num = acc.account_num;
                match.account_number = acc.account_number; // Keep aliases safe
            }
            
            const severityRank = { 'High': 3, 'Medium': 2, 'Low': 1 };
            if ((severityRank[acc.severity] || 0) > (severityRank[match.severity] || 0)) {
                match.severity = acc.severity;
                match.details = acc.details;
                match.is_negative = true;
            }
            match.tags = [...new Set([...match.tags, ...acc.tags])];
            match.balance = Math.max(match.balance, acc.balance);
            match.limit = Math.max(match.limit, acc.limit);
            if(acc.is_negative) match.is_negative = true;
        } else {
            // Ensure both the array and the string exist
            merged.push({ ...acc, bureaus: [acc.bureau], bureau: acc.bureau });
        }
    });
    return merged;
}

function consolidateInquiries(inquiries) {
    const merged = [];
    inquiries.forEach(inq => {
        const match = merged.find(m => normalizeName(m.creditor) === normalizeName(inq.creditor) && m.date === inq.date);
        if (match) {
            if (!match.bureaus.includes(inq.bureau)) match.bureaus.push(inq.bureau);
        } else {
            merged.push({ ...inq, bureaus: [inq.bureau] });
        }
    });
    return merged;
}

// 👇 UPDATED: Smarter, looser negative merging for cross-bureau duplicates 👇
function consolidateNegatives(negatives) {
    const merged = [];
    negatives.forEach(neg => {
        const cleanNum = (neg.account_num || "").replace(/[^0-9]/g, '');
        const normName = normalizeName(neg.name);

        const match = merged.find(m => {
            // 🚧 FIX #1: THE ULTIMATE SAFETY FENCE 🚧
            // Absolutely forbid merging different TYPES of negative items!
            if ((m.category === 'INQUIRY') !== (neg.category === 'INQUIRY')) return false;
            if ((m.category === 'PUBLIC_RECORD') !== (neg.category === 'PUBLIC_RECORD')) return false;
            if ((m.category === 'UTILIZATION') !== (neg.category === 'UTILIZATION')) return false;
            // 👆 End Safety Fence

            const mClean = (m.account_num || "").replace(/[^0-9]/g, '');
            const mName = normalizeName(m.name);
            
            const numMatch = (cleanNum.length > 3 && mClean.length > 3) && (cleanNum.includes(mClean) || mClean.includes(cleanNum));
            // Looser name matching
            const nameMatch = normName === mName || (normName.length > 3 && mName.length > 3 && (normName.includes(mName) || mName.includes(normName)));

            // If the account numbers match, merge them (even if categories differ slightly)
            if (numMatch) return true;
            // If names match and neither has a reliable account number, merge them
            if (nameMatch && (!cleanNum || !mClean)) return true;
            return false;
        });
        
        if (match) {
            // 👇 FIX #2: Rewrite the string so your UI displays all bureaus! 👇
            if (!match.bureaus.includes(neg.bureau)) {
                match.bureaus.push(neg.bureau);
                match.bureau = match.bureaus.join(', '); // Turns "TU" into "TU, EX, EQ"
            }
            if (cleanNum.length > (match.account_num || "").replace(/[^0-9]/g, '').length) {
                match.account_num = neg.account_num;
                match.account_number = neg.account_number; // Keep aliases safe
            }
            
            // Take the highest balance
            if (neg.balance > (match.balance || 0)) match.balance = neg.balance;
            
            if (neg.category === 'COLLECTION' && match.category !== 'COLLECTION') {
                match.category = 'COLLECTION';
            }
        } else {
            // Ensure both the array and the string exist
            merged.push({ ...neg, bureaus: [neg.bureau], bureau: neg.bureau });
        }
    });
    return merged;
}

function normalizeName(str) {
    if (!str) return "";
    let clean = str.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.includes("PENTAGON")) return "PENTAGONFCU";
    if (clean.includes("SELFINC") || clean.includes("SELFFIN")) return "SELFFINANCIAL";
    if (clean.includes("AMEX") || clean.includes("AMERICANEXP")) return "AMEX";
    if (clean.includes("BANKOFAM") || clean.includes("BKOFAM")) return "BANKOFAMERICA";
    if (clean.includes("CAPITALONE") || clean.includes("CAPONE")) return "CAPITALONE";
    if (clean.includes("JPM") || clean.includes("CHASE")) return "JPMORGAN";
    return clean;
}

function normalizeRecursive(obj) {
    if (Array.isArray(obj)) return obj.map(normalizeRecursive);
    if (obj !== null && typeof obj === 'object') {
        if (Object.keys(obj).length === 1 && obj['$'] !== undefined) return obj['$'];
        const newObj = {};
        for (const key in obj) {
            let newKey = key.startsWith('@') ? key.substring(1) : key;
            newObj[newKey] = normalizeRecursive(obj[key]);
        }
        return newObj;
    }
    return obj;
}

function getValue(field) {
    if (field === null || field === undefined) return null;
    if (typeof field === 'object' && field['$']) return field['$'];
    return field;
}

function findValueByKeys(obj, keyNames) {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of Object.keys(obj)) {
        if (keyNames.includes(k)) return obj[k];
        const v = obj[k];
        if (v && typeof v === 'object') {
            const found = findValueByKeys(v, keyNames);
            if (found !== null && found !== undefined) return found;
        }
    }
    return null;
}

function extractDigits(val) {
    if (!val && val !== 0) return null;
    if (typeof val === 'object') val = val['$'] || val['Value'] || Object.values(val)[0] || null;
    if (!val) return null;
    const s = String(val).replace(/[^0-9]/g, '');
    return s.length ? s : null;
}

function normalizeBureau(b) {
    if (!b) return 'UNK';
    const s = String(getValue(b)).toUpperCase();
    if (s.includes('TRANS') || s.includes('TUC') || s === 'TU') return 'TU';
    if (s.includes('EXP') || s.includes('XPN') || s === 'EX') return 'EX';
    if (s.includes('EQUI') || s.includes('EQF') || s.includes('EFX') || s === 'EQ') return 'EQ';
    return 'UNK';
}

function parseMoney(val) {
    const v = getValue(val); 
    if (!v) return 0;
    if (typeof v === 'number') return v;
    return parseFloat(String(v).replace(/[$,]/g, '')) || 0;
}

// --- PARSER ---

function parseMergeReport(merge, audit) {
    const today = new Date();

    // 1. Personal Info
    if (merge.Borrower) {
        const names = normalizeList(merge.Borrower.BorrowerName);
        if (names.length > 0) {
            const n = names[0].Name;
            const full = `${getValue(n.first) || ''} ${getValue(n.middle) || ''} ${getValue(n.last) || ''}`.replace(/\s+/g, ' ').trim();
            audit.personal.names.push(full);
        }
        // Attempt to extract SSN from common locations (direct field or nested partitions)
        const ssnRaw = getValue(merge.Borrower.SocialSecurityNumber) || getValue(merge.Borrower.SSN) || findValueByKeys(merge.Borrower, ['SocialSecurityNumber','SSN','SocialSecurity','SocialPartition','Social']);
        const ssnDigits = extractDigits(ssnRaw);
        if (ssnDigits) audit.personal.ssn = ssnDigits;

        // Fallback: try to find names in alternate locations when BorrowerName missing
        if (audit.personal.names.length === 0) {
            const altName = findValueByKeys(merge.Borrower, ['BorrowerName','Name','FullName','PersonName']);
            if (altName) {
                if (Array.isArray(altName)) {
                    altName.forEach(a => {
                        const v = (a?.Name) ? `${getValue(a.Name.first)||''} ${getValue(a.Name.last)||''}`.trim() : getValue(a) || '';
                        if (v) audit.personal.names.push(v);
                    });
                } else {
                    const v = getValue(altName) || (altName.Name ? `${getValue(altName.Name.first)||''} ${getValue(altName.Name.last)||''}`.trim() : '');
                    if (v) audit.personal.names.push(v);
                }
            }
        }
        normalizeList(merge.Borrower.BorrowerAddress).forEach(a => {
            const ad = a.CreditAddress;
            if (!ad) return;
            const line = getValue(ad.unparsedStreet) || `${getValue(ad.houseNumber) || ''} ${getValue(ad.streetName) || ''} ${getValue(ad.streetType) || ''}`;
            const city = `${getValue(ad.city) || ''}, ${getValue(ad.stateCode) || ''} ${getValue(ad.postalCode) || ''}`;
            audit.personal_info.push({
                type: 'ADDRESS',
                value: `${line}, ${city}`.replace(/\s+/g, ' ').trim(),
                date_reported: getValue(a.dateReported),
                bureau: normalizeBureau(a.Source?.Bureau?.symbol || a.Source?.Bureau?.abbreviation)
            });
        });
        audit.personal.address_count = audit.personal_info.length;
    }

// 2. Public Records Normalization Engine
    normalizeList(merge.PublicRecordPartition).forEach(part => {
        const pr = part.PublicRecord;
        if (!pr) return;
        
        const rawType = (getValue(pr.Type?.description) || getValue(pr.Type) || "Public Record").toLowerCase();
        const bureau = normalizeBureau(getValue(pr.bureau) || pr.Source?.Bureau?.symbol || part.Source?.Bureau?.symbol);
        const amount = parseMoney(pr.amount); 
        
        // 👇 STANDARDIZATION ROUTER (Matching Owner Requirements) 👇
        let finalType = "Public Record";
        
        if (rawType.includes("bankruptcy") || rawType.includes("chapter")) {
            if (rawType.includes("7")) finalType = "Bankruptcy (Chapter 7)";
            else if (rawType.includes("13")) finalType = "Bankruptcy (Chapter 13)";
            else if (rawType.includes("11")) finalType = "Bankruptcy (Chapter 11)";
            else finalType = "Bankruptcy Record";
        } 
        else if (rawType.includes("lien") || rawType.includes("tax")) {
            if (rawType.includes("state")) finalType = "State Tax Lien";
            else finalType = "Federal Tax Lien";
        } 
        else if (rawType.includes("judgment") || rawType.includes("civil")) {
            finalType = "Civil Judgment";
        } else {
            finalType = getValue(pr.Type?.description) || "Public Record";
        }
        
        audit.public_records.push({
            type: finalType,
            bureau: bureau,
            date_filed: getValue(pr.dateFiled),
            reference_number: getValue(pr.referenceNumber),
            amount: amount,
            status: getValue(pr.Status?.description) || getValue(pr.Status) || ""
        });
        
        audit.negatives.push({
            category: 'PUBLIC_RECORD',
            name: finalType,
            account: finalType, 
            account_name: finalType, 
            bureau: bureau,
            detail: `${finalType} (${getValue(pr.courtName) || 'On File'})`,
            reason: finalType,
            date: getValue(pr.dateFiled),
            balance: amount, 
            severity: 'High',
            action: 'Dispute'
        });
        if (audit.bureau_stats[bureau]) audit.bureau_stats[bureau].public_record_count++;
    });

    // 3. Collections
    normalizeList(merge.CollectionPartition).forEach(part => {
        const coll = part.Collection;
        if (!coll) return;
        const name = getValue(coll.creditorName) || getValue(coll.subscriberName) || "Collection Agency";
        const bureau = normalizeBureau(getValue(coll.bureau) || coll.Source?.Bureau?.symbol || part.Source?.Bureau?.symbol);
        const amount = parseMoney(coll.originalBalance || coll.balance);
        const dateOpened = getValue(coll.dateOpened);

        audit.negatives.push({
            category: 'COLLECTION',
            name: name,
            account: name,
            account_name: name,
            account_num: getValue(coll.accountNumber),
            bureau: bureau,
            detail: `Collection: $${amount}`,
            reason: 'Collection',
            date: dateOpened,
            balance: amount, 
            severity: 'High',
            action: 'Dispute'
        });
        if (audit.bureau_stats[bureau]) audit.bureau_stats[bureau].negative_count++;
    });

    // 4. Inquiries
    const inqPartitions = normalizeList(merge.InquiryPartition);
    const allInquiries = inqPartitions.flatMap(part => {
        const items = normalizeList(part.Inquiry);
        return items.map(i => ({...i, _source: part.Source }));
    });

    allInquiries.forEach(i => {
        if (!i) return;
        // Try multiple possible keys for the date
        const dateStr = getValue(i.inquiryDate) || getValue(i.InquiryDate) || getValue(i.date) || getValue(i.Date);
        const name = getValue(i.subscriberName) || getValue(i.creditorName);
        const bureau = normalizeBureau(getValue(i.bureau) || i.Source?.Bureau?.symbol || i.Source?.Bureau?.abbreviation || i._source?.Bureau?.symbol);
        const type = getValue(i.IndustryCode?.description) || 'Unknown';
        
        let monthsAgo = 99;
        if (dateStr) {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                monthsAgo = (today.getFullYear() - date.getFullYear()) * 12 + (today.getMonth() - date.getMonth());
            }
        }

        audit.inquiries.push({
            creditor: name,
            date: dateStr, 
            bureau: bureau,
            type: type
        });
        
        if (audit.bureau_stats[bureau]) audit.bureau_stats[bureau].inquiry_count++;

        if (monthsAgo <= 6) audit.summary.inquiries_6mo++;
        if (monthsAgo <= 24) audit.summary.inquiries_24mo++;

        if (monthsAgo <= 24) {
            audit.negatives.push({
                category: 'INQUIRY',
                name: name,
                account: name, 
                account_name: name,
                bureau: bureau,
                detail: `Hard Inquiry on ${dateStr}`,
                reason: 'Unverified Inquiry',
                date: dateStr,
                balance: 0, 
                severity: 'Low',
                action: 'Dispute'
            });
        }
    });

    // 5. Tradelines
// --- Tradelines Processing Loop ---
const tlPartitions = normalizeList(merge.TradeLinePartition);
const allTradelines = tlPartitions.flatMap(part => {
    const items = normalizeList(part.Tradeline);
    // accountTypeSymbol/accountTypeDescription live on the PARTITION, not
    // per-tradeline — some sources (IdentityIQ) populate these but leave
    // GrantedTrade.CreditType sparse/null on individual tradelines, same
    // fallback src/utils/parseSmartCredit.js already relies on for the
    // exact same data. Threaded through here so the classification below
    // can fall back to them instead of only ever reading GrantedTrade.
    return items.map(tl => ({
        ...tl,
        _partSource: part.Source,
        _partBureau: part.creditReportSource,
        _partAccountTypeSymbol: getValue(part.accountTypeSymbol),
        _partAccountTypeDesc: getValue(part.accountTypeDescription),
    }));
});

allTradelines.forEach(tl => {
    if (!tl) return;

    const name = getValue(tl.creditorName) || getValue(tl.subscriberName);
    const accountNum = getValue(tl.accountNumber);
    const rawBureau = getValue(tl.bureau) || tl.Source?.Bureau?.symbol || tl._partSource?.Bureau?.symbol || tl._partBureau;
    const bureau = normalizeBureau(rawBureau);
    
    const openClosed = getValue(tl.OpenClosed?.description) || getValue(tl.OpenClosed) || "Unknown";
    const statusDesc = getValue(tl.PayStatus?.description) || getValue(tl.PayStatus) || "";
    const statusSymbol = getValue(tl.PayStatus?.symbol) || "";
    const worstStatusSymbol = getValue(tl.GrantedTrade?.WorstPayStatus?.symbol) || "";
    const historyString = getValue(tl.GrantedTrade?.PayStatusHistory?.status) || "";
    const dateOpened = getValue(tl.dateOpened);
    const dateReported = getValue(tl.dateReported);
    
    const balance = parseMoney(tl.currentBalance);
    const limit = parseMoney(tl.GrantedTrade?.CreditLimit || tl.creditLimit || tl.highBalance);
    const monthlyPayment = parseMoney(tl.GrantedTrade?.monthlyPaymentAmount || tl.monthlyPayment);
    const pastDueAmount = parseMoney(tl.GrantedTrade?.amountPastDue || tl.amountPastDue);

    const isOpen = (openClosed.toLowerCase() === 'open');
    // Falls back to the partition-level type fields (see _partAccountTypeDesc
    // above) when GrantedTrade.CreditType/AccountType are empty on this
    // specific tradeline — matches parseSmartCredit.js's own fallback for
    // the identical data, so both parsers see the same effective type text.
    const typeDesc = getValue(tl.GrantedTrade?.CreditType?.description) || getValue(tl.GrantedTrade?.AccountType?.description) || tl._partAccountTypeDesc || "Unknown";
    const typeDescLower = typeDesc.toLowerCase();
    const ctSymbol = getValue(tl.GrantedTrade?.CreditType?.symbol) || tl._partAccountTypeSymbol || "";

    // 1. 👇 REVOLVING & LINE OF CREDIT ALIAS MATCHING 👇
    // "revolving" as a literal word was previously never checked — only the
    // narrower "credit card"/"bankcard"/"line of credit" substrings were —
    // so a tradeline whose type description just says e.g. "Revolving
    // Account" or "Revolving Charge Account" fell through this entirely,
    // never counted toward total_revolving_limit/debt, and utilization
    // stayed 0% even for a client who clearly has revolving debt. "CC" is
    // a second real CreditType.symbol value (two-letter, distinct from "R")
    // seen for credit cards in this same report family — see
    // parseCreditType's symbol map in parseSmartCredit.js.
    const isBankcard = typeDescLower.includes('credit card') || typeDescLower.includes('bankcard');
    const isLineOfCredit = typeDescLower.includes('line of credit') || typeDescLower.includes('credit line');
    const isRevolvingWord = typeDescLower.includes('revolving');
    const isRevolving = isBankcard || isLineOfCredit || isRevolvingWord || ctSymbol === "R" || ctSymbol === "CC";

    // 2. 👇 INSTALLMENT PROFILE RECOGNITION 👇
    const isAuto = typeDescLower.includes('auto');
    const isStudent = typeDescLower.includes('student') || typeDescLower.includes('treasury') || typeDescLower.includes('treafms');
    const isUnsecuredLoan = typeDescLower.includes('unsecured') || typeDescLower.includes('personal');
    const isMortgage = typeDescLower.includes('mortgage') || ctSymbol === "M";
    const isInstallment = isAuto || isStudent || isUnsecuredLoan || isMortgage || typeDescLower.includes('installment') || ctSymbol === "I";

    const remarks = normalizeList(tl.Remark).map(r => getValue(r.RemarkCode?.description)).join(', ');
    const fullStatusString = `${statusDesc} ${remarks} ${openClosed}`.toLowerCase();

    let isNegative = false;
    let isSettled = fullStatusString.includes('settled');
    let isActiveCollection = false;
    let tags = [];
    let severity = "Low";
    let negativeReason = "";

    const badWords = ['collection', 'charge-off', 'charge off', 'repossession', 'foreclosure', 'settled', 'voluntary surrender', 'bad debt', 'write-off', 'loss', 'unpaid balance', 'attorney'];
    
    // 3. 👇 ACTIVE OPEN COLLECTIONS VS HISTORICAL SETTLED RECOVERY 👇
    if (fullStatusString.includes('collection') || fullStatusString.includes('assigned to attorney') || badWords.some(w => fullStatusString.includes(w))) {
        isNegative = true;
        if (isOpen || balance > 0 || pastDueAmount > 0) {
            isActiveCollection = true;
            tags.push('Active Collection');
            negativeReason = statusDesc || 'Active Unpaid Collection';
            severity = 'High';
        } else {
            tags.push('Closed Derogatory');
            negativeReason = isSettled ? 'Settled for Less Than Full Balance' : 'Closed Negative Archive';
            severity = 'Medium';
        }
    }

    let lateTag = null;
    const isLateSymbol = ['1','2','3','4','5','7','8','9'].includes(statusSymbol) || ['1','2','3','4','5','7','8','9'].includes(worstStatusSymbol);
    const isLateHistory = /[1-9]/.test(historyString); 
    
    if (isLateSymbol || isLateHistory || statusDesc.includes('30') || statusDesc.toLowerCase().includes('past due') || ['2','3','4','5'].includes(statusSymbol)) {
        if (statusSymbol === '1' || historyString.includes('1') || statusDesc.includes('30')) lateTag = 'Late-30';
        else if (statusSymbol === '2' || historyString.includes('2') || statusDesc.includes('60')) lateTag = 'Late-60';
        else if (statusSymbol === '3' || historyString.includes('3') || statusDesc.includes('90')) lateTag = 'Late-90';
        else lateTag = 'Late-120+'; 
    }

    if (lateTag) {
        isNegative = true;
        tags.push('Late Payment');
        tags.push(lateTag);
        negativeReason = lateTag;
        severity = isOpen ? 'High' : 'Medium';
    }

    if (pastDueAmount > 0 && !isActiveCollection) {
        tags.push('Current Past Due');
        isNegative = true;
        severity = 'High';
    }

    let utilPct = 0;
    let utilStatus = "Excellent";
    if (isOpen && isRevolving && limit > 0) {
        utilPct = Math.round((balance / limit) * 100);
        if (utilPct >= 75) utilStatus = "Very Poor";
        else if (utilPct >= 50) utilStatus = "Poor";
        else if (utilPct >= 30) utilStatus = "Fair";
        else if (utilPct >= 10) utilStatus = "Good";

        if (utilPct >= 30) {
            isNegative = true;
            tags.push('High Utilization');
            negativeReason = `High Utilization (${utilPct}%)`;
            
            audit.negatives.push({
                category: 'UTILIZATION',
                name: name,
                account: name, 
                account_name: name, 
                account_num: accountNum,
                bureau: bureau,
                detail: `Usage at ${utilPct}%`,
                reason: 'Revolving Leverage Flag',
                date: dateReported,
                balance: balance, 
                severity: utilPct >= 90 ? 'High' : 'Medium',
                action: 'Pay Down'
            });
        }

        if (audit.bureau_stats[bureau]) {
            audit.bureau_stats[bureau].revolving_limit += limit;
            audit.bureau_stats[bureau].revolving_debt += balance;
        }
    }

    const isStrictPositive = !isNegative && isOpen && (isRevolving ? utilPct < 30 : true);

    const account = {
        name: name,
        account: name, 
        account_name: name, 
        account_num: accountNum,
        account_number: accountNum, 
        bureau: bureau, 
        status: statusDesc || openClosed,
        account_status: openClosed,
        payment_status: statusDesc,
        monthly_payment: monthlyPayment,
        balance: balance,
        limit: limit,
        pastDue: pastDueAmount,
        opened: dateOpened,
        dateOpened: dateOpened, 
        type: typeDesc,
        is_revolving: isRevolving,
        is_installment: isInstallment,
        is_active_collection: isActiveCollection,
        is_settled: isSettled,
        is_negative: isNegative,
        is_positive: isStrictPositive,
        tags: tags,
        utilization_pct: utilPct,
        utilization_status: utilStatus,
        severity: severity,
        details: remarks || statusDesc,
        remarks: remarks
    };

    if (isNegative) {
        if (!tags.includes('Utilization') || tags.length > 1) {
             audit.negatives.push({
                category: isActiveCollection ? 'COLLECTION' : 'LATE_PAYMENT',
                name: name,
                account: name, 
                account_name: name, 
                account_num: accountNum, 
                bureau: bureau,
                detail: negativeReason,
                reason: tags.join(', '),
                date: dateOpened,
                balance: balance, 
                severity: severity,
                action: 'Dispute'
            });
        }
        if (audit.bureau_stats[bureau]) audit.bureau_stats[bureau].negative_count++;
    } else {
         if (audit.bureau_stats[bureau]) audit.bureau_stats[bureau].positive_count++;
    }
    
    if (audit.bureau_stats[bureau]) audit.bureau_stats[bureau].account_count++;

    if (isOpen && isRevolving && limit > 0) {
        audit.summary.total_revolving_limit += limit;
        audit.summary.total_revolving_debt += balance;
    }

    audit.accounts.push(account);
    if (isOpen) {
        audit.summary.open_accounts++;
        audit.summary.total_debt += balance;
    }
});
}

function emptyAudit() {
  return {
      meta: { source: 'Unknown', audit_date: new Date().toISOString(), version: '3.0' },
      scores: { EX: 0, TU: 0, EQ: 0 },
      summary: {
          total_accounts: 0, open_accounts: 0, total_debt: 0,
          total_revolving_limit: 0, total_revolving_debt: 0, total_available: 0, utilization_pct: 0,
          inquiries_6mo: 0, inquiries_24mo: 0, negatives_count: 0
      },
      bureau_stats: {
          EX: { account_count: 0, positive_count: 0, negative_count: 0, inquiry_count: 0, public_record_count: 0, revolving_limit: 0, revolving_debt: 0, utilization_pct: 0 },
          TU: { account_count: 0, positive_count: 0, negative_count: 0, inquiry_count: 0, public_record_count: 0, revolving_limit: 0, revolving_debt: 0, utilization_pct: 0 },
          EQ: { account_count: 0, positive_count: 0, negative_count: 0, inquiry_count: 0, public_record_count: 0, revolving_limit: 0, revolving_debt: 0, utilization_pct: 0 },
          UNK: { account_count: 0, positive_count: 0, negative_count: 0, inquiry_count: 0, public_record_count: 0, revolving_limit: 0, revolving_debt: 0, utilization_pct: 0 }
      },
      personal_info: [],
      personal: { ssn: null, names: [], address_count: 0 },
      inquiries: [],
      public_records: [],
      accounts: [],
      negatives: []
  };
}

function normalizeList(item) {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}
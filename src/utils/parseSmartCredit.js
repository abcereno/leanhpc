/**
 * parseSmartCredit.js
 * Robust IdentityIQ (SmartCredit) credit report parser.
 *
 * Handles:
 *  - Accounts reporting on 1, 2, or all 3 bureaus (merges by fuzzy name + account number)
 *  - Revolving, Installment, Open/Collection account types
 *  - Missing/null fields at every level (safe optional-chaining throughout)
 *  - All 4 output arrays: accounts, negatives, inquiries, public_records
 *  - bureau_stats computed from per-account data (not the raw Summary block)
 *  - Utilization breakdown per revolving account
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const BUREAU_MAP = {
  TransUnion:  "TU",
  transunion:  "TU",
  TUC:         "TU",
  TU:          "TU",
  Experian:    "EX",
  experian:    "EX",
  EXP:         "EX",
  EX:          "EX",
  Equifax:     "EQ",
  equifax:     "EQ",
  EQF:         "EQ",
  EQ:          "EQ",
};

/** Normalize any bureau string to "TU" | "EX" | "EQ" | null */
function normalizeBureau(raw) {
  if (!raw) return null;
  return BUREAU_MAP[raw.trim()] ?? null;
}

/** PayStatus symbol → { isNegative, label, severity } */
function classifyPayStatus(symbol, remarks = []) {
  if (!symbol) return { isNegative: false, label: "Unknown", severity: "Low" };

  const s = String(symbol).trim();

  // Positive / current
  if (["C", "0", "OK"].includes(s)) return { isNegative: false, label: "Current", severity: "Low" };
  if (s === "ND") return { isNegative: false, label: "No Data", severity: "Low" };
  if (s === "U")  return { isNegative: false, label: "Unknown", severity: "Low" };

  // Late
  if (s === "1") return { isNegative: true, label: "Late-30",  severity: "Medium" };
  if (s === "2") return { isNegative: true, label: "Late-60",  severity: "Medium" };
  if (s === "3") return { isNegative: true, label: "Late-90",  severity: "High"   };
  if (s === "4") return { isNegative: true, label: "Late-120+", severity: "High"  };

  // Collection / charge-off
  if (["9", "CO", "CA"].includes(s)) {
    const remarkLabels = remarks.map(r => r?.RemarkCode?.abbreviation ?? "").join(" ");
    const isCollection = /collection/i.test(remarkLabels);
    return { isNegative: true, label: isCollection ? "Collection" : "Charge-Off", severity: "High" };
  }

  // Derogatory catch-all
  if (["F", "G", "8"].includes(s)) return { isNegative: true, label: "Derogatory", severity: "High" };

  return { isNegative: false, label: symbol, severity: "Low" };
}

/** AccountCondition.symbol → isNegative boolean override */
function isConditionDerog(symbol) {
  return ["F", "D"].includes(String(symbol ?? "").trim());
}

/** OpenClosed.symbol → "Open" | "Closed" */
function parseOpenClosed(symbol) {
  if (!symbol) return "Unknown";
  const s = String(symbol).trim().toUpperCase();
  if (s === "O") return "Open";
  if (s === "C") return "Closed";
  return symbol;
}

/** CreditType.symbol → account type label */
function parseCreditType(symbol, accountTypeAbbrev) {
  const s = String(symbol ?? "").trim();
  const map = { R: "Revolving", I: "Installment", O: "Open Account", M: "Mortgage", CC: "Credit Card" };
  if (map[s]) return map[s];
  if (accountTypeAbbrev) return String(accountTypeAbbrev).trim();
  return "Unknown";
}

/** Util pct → status label */
function utilizationStatus(pct) {
  if (pct === null || pct === undefined) return "N/A";
  if (pct === 0)   return "Excellent";
  if (pct <= 10)   return "Excellent";
  if (pct <= 29)   return "Good";
  if (pct <= 49)   return "Fair";
  if (pct <= 74)   return "Poor";
  return "Very Poor";
}

/** Severity based on worst pay status + derog flag */
function computeSeverity(isNegative, payStatusLabel) {
  if (!isNegative) return "Low";
  if (["Late-30", "Late-60"].includes(payStatusLabel)) return "Medium";
  return "High";
}

/** Build a canonical name key for merging: uppercase, strip spaces/punctuation */
function nameKey(name) {
  return String(name ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Build a canonical account-number key: last 6 digits (or full if <6) */
function acctKey(num) {
  const s = String(num ?? "").replace(/\D/g, "");
  return s.slice(-6);
}

/** Format CreditAddress to a single-line string */
function formatAddress(ca, dateReported, bureau) {
  if (!ca) return null;
  const parts = [];
  if (ca.unparsedStreet) {
    parts.push(ca.unparsedStreet);
  } else {
    const street = [ca.houseNumber, ca.direction, ca.streetName, ca.streetType, ca.postDirection, ca.unit]
      .filter(Boolean).join(" ").trim();
    if (street) parts.push(street);
  }
  if (ca.city)       parts.push(ca.city);
  if (ca.stateCode)  parts.push(ca.stateCode);
  if (ca.postalCode) parts.push(ca.postalCode.slice(0, 5)); // normalize to 5-digit
  return {
    type: "ADDRESS",
    value: parts.join(", "),
    date_reported: dateReported ?? null,
    bureau: bureau ?? null,
  };
}

// ─── MAIN PARSER ──────────────────────────────────────────────────────────────

/**
 * parseSmartCredit(rawJson)
 *
 * @param {object|string} rawJson  - The raw IdentityIQ API response
 * @returns {object}               - Normalized payload ready for your components
 */
function parseSmartCredit(rawJson) {
  const data = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;

const bundle = data?.report?.BundleComponents?.BundleComponent 
              ?? data?.BundleComponents?.BundleComponent 
              ?? [];
  // ── 1. SCORES ────────────────────────────────────────────────────────────────
  const scores = { EX: null, TU: null, EQ: null };
  let bankruptcyDetectedViaFactors = false;

  for (const component of bundle) {
    const type = component?.Type ?? "";
    const scoreType = component?.CreditScoreType;
    if (!scoreType) continue;

    const riskScore = parseInt(scoreType.riskScore, 10) || null;
    if (type.startsWith("TUC"))  scores.TU = riskScore;
    if (type.startsWith("EXP"))  scores.EX = riskScore;
    if (type.startsWith("EQF"))  scores.EQ = riskScore;

    // Sweep for hidden bankruptcies (Factor Code 98 signal)
    if (scoreType.CreditScoreFactor) {
      const factors = Array.isArray(scoreType.CreditScoreFactor)
        ? scoreType.CreditScoreFactor
        : [scoreType.CreditScoreFactor];
      if (factors.some(f => String(f.bureauCode) === "98")) {
        bankruptcyDetectedViaFactors = true;
      }
    }
  }

  // ── 2. Find the CreditReportData component ───────────────────────────────────
  // IdentityIQ nests it under different keys depending on the report version:
  //   • "MergeCreditReports" component → TrueLinkCreditReportType
  //   • "CreditReportData" key
  //   • Or directly on the component (Borrower / TradeLinePartition at root)
  let reportData = null;

  for (const component of bundle) {
    // Most common: MergeCreditReports → TrueLinkCreditReportType
    if (component?.TrueLinkCreditReportType) {
      reportData = component.TrueLinkCreditReportType;
      break;
    }
    // Alternate: CreditReportData wrapper
    if (component?.CreditReportData) {
      reportData = component.CreditReportData;
      break;
    }
  }

  if (!reportData) {
    // Fallback: find the first component that looks like report data
    for (const component of bundle) {
      if (component?.TradeLinePartition || component?.Borrower) {
        reportData = component;
        break;
      }
    }
  }

  // ── 3. PERSONAL INFO ─────────────────────────────────────────────────────────
  const borrower    = reportData?.Borrower ?? {};
  const rawNames    = borrower?.BorrowerName ?? [];
  const rawAddresses = borrower?.BorrowerAddress ?? [];
  const socialRaw   = borrower?.SocialSecurityNumber
    ?? borrower?.SocialPartition?.Social?.[0]?.SocialSecurityNumber
    ?? null;

  // Deduplicate names
  const seenNames = new Set();
  const names = [];
  for (const n of rawNames) {
    const parts = [n?.Name?.first, n?.Name?.middle, n?.Name?.last, n?.Name?.suffix]
      .filter(Boolean).join(" ").trim().toUpperCase();
    if (parts && !seenNames.has(parts)) {
      seenNames.add(parts);
      names.push(parts);
    }
  }

  // Build personal_info addresses
  const personal_info = [];
  for (const addr of rawAddresses) {
    const bureauCode = normalizeBureau(
      addr?.Source?.Bureau?.symbol ?? addr?.Source?.Bureau?.abbreviation
    );
    const formatted = formatAddress(addr?.CreditAddress, addr?.dateReported, bureauCode);
    if (formatted?.value) personal_info.push(formatted);
  }

  // Deduplicate addresses
  const seenAddr = new Set();
  const uniquePersonalInfo = personal_info.filter(a => {
    if (seenAddr.has(a.value)) return false;
    seenAddr.add(a.value);
    return true;
  });

  const ssn = socialRaw
    ? String(socialRaw).replace(/\D/g, "").slice(-4)
    : null;

  const personal = {
    ssn,
    names,
    address_count: uniquePersonalInfo.length,
  };

  // ── 4. TRADELINES → ACCOUNTS ─────────────────────────────────────────────────
  const tradeLinePartitions = reportData?.TradeLinePartition ?? [];

  /**
   * Merge strategy:
   * - Each TradeLinePartition has a Tradeline[] array, one entry per bureau.
   * - We treat all tradelines within the same partition as the same account.
   * - For cross-partition dedup (shouldn't happen but just in case),
   *   we also key on normalized name + last-6 account digits.
   */

  const mergedAccounts = []; // final array
  const accountIndex = new Map(); // key → index in mergedAccounts

  for (const partition of tradeLinePartitions) {
    const acctTypeSymbol = partition?.accountTypeSymbol ?? "";
    const acctTypeAbbrev = partition?.accountTypeAbbreviation ?? "";
    const acctTypeDesc   = partition?.accountTypeDescription ?? "";

    const tradelines = Array.isArray(partition?.Tradeline)
      ? partition.Tradeline
      : partition?.Tradeline
        ? [partition.Tradeline]
        : [];

    if (tradelines.length === 0) continue;

    // Collect bureau entries
    const bureauEntries = [];
    for (const tl of tradelines) {
      const bureauRaw = tl?.bureau ?? tl?.Source?.Bureau?.abbreviation ?? tl?.Source?.Bureau?.symbol;
      const bureau    = normalizeBureau(bureauRaw);
      if (!bureau) continue;

      const gt = tl?.GrantedTrade ?? {};
      const payStatusSymbol = tl?.PayStatus?.symbol ?? "";
      const remarks = Array.isArray(tl?.Remark) ? tl.Remark : tl?.Remark ? [tl.Remark] : [];
      const payInfo = classifyPayStatus(payStatusSymbol, remarks);

      bureauEntries.push({
        bureau,
        accountNumber:   tl?.accountNumber   ?? "",
        creditorName:    tl?.creditorName     ?? "",
        currentBalance:  parseFloat(tl?.currentBalance ?? 0) || 0,
        dateOpened:      tl?.dateOpened       ?? null,
        dateReported:    tl?.dateReported     ?? null,
        dateLastPayment: gt?.dateLastPayment  ?? null,
        dateClosed:      tl?.dateClosed       ?? null,
        creditLimit:     parseFloat(gt?.CreditLimit ?? 0) || 0,
        highBalance:     parseFloat(tl?.highBalance ?? 0) || 0,
        monthlyPayment:  parseFloat(gt?.monthlyPayment ?? 0) || 0,
        amountPastDue:   parseFloat(gt?.amountPastDue ?? 0) || 0,
        late30:          parseInt(gt?.late30Count ?? 0, 10),
        late60:          parseInt(gt?.late60Count ?? 0, 10),
        late90:          parseInt(gt?.late90Count ?? 0, 10),
        openClosed:      parseOpenClosed(tl?.OpenClosed?.symbol),
        payStatusSymbol,
        payStatusLabel:  tl?.PayStatus?.abbreviation ?? payInfo.label,
        isNegative:      payInfo.isNegative || isConditionDerog(tl?.AccountCondition?.symbol),
        severity:        payInfo.severity,
        accountCondition: tl?.AccountCondition?.abbreviation ?? "",
        creditTypeSymbol: gt?.CreditType?.symbol ?? acctTypeSymbol,
        creditTypeLabel:  gt?.CreditType?.abbreviation ?? acctTypeAbbrev,
        industryCode:     tl?.IndustryCode?.abbreviation ?? "",
        accountTypeDesc: acctTypeDesc,
        designator:      tl?.AccountDesignator?.description ?? tl?.AccountDesignator?.abbreviation ?? "",
        remarks,
        worstPayStatus:  gt?.WorstPayStatus?.abbreviation ?? "",
        payStatusHistory: gt?.PayStatusHistory?.status ?? "",
        monthlyPayStatuses: gt?.PayStatusHistory?.MonthlyPayStatus ?? [],
      });
    }

    if (bureauEntries.length === 0) continue;

    // Use the first entry as the "best" source for name/number
    // (prefer the one with the most data; they're the same account)
    const best = bureauEntries.reduce((a, b) =>
      (b.creditorName.length > a.creditorName.length || b.creditLimit > a.creditLimit) ? b : a
    );

    const bureaus    = [...new Set(bureauEntries.map(e => e.bureau))].sort();
    const bureauStr  = bureaus.join(", ");
    const balances   = bureauEntries.map(e => e.currentBalance).filter(v => v > 0);
    const balance    = balances.length ? Math.max(...balances) : 0;
    const limits     = bureauEntries.map(e => e.creditLimit).filter(v => v > 0);
    const limit      = limits.length ? Math.max(...limits) : 0;
    const pastDues   = bureauEntries.map(e => e.amountPastDue).filter(v => v > 0);
    const pastDue    = pastDues.length ? Math.max(...pastDues) : 0;
    const isNegative = bureauEntries.some(e => e.isNegative);
    const isPositive = !isNegative;
    const severity   = isNegative ? bureauEntries.map(e => e.severity).sort().pop() : "Low";

    // Account type flags
    const ctSym = best.creditTypeSymbol;
    const isRevolving    = ["R"].includes(ctSym) || /revolving/i.test(acctTypeDesc);
    const isInstallment  = ["I", "M"].includes(ctSym) || /installment|mortgage/i.test(acctTypeDesc);
    const isCollection   = ["O"].includes(ctSym) || /collection/i.test(best.payStatusLabel);
    const isChargeOff    = /charge.?off/i.test(best.payStatusLabel);
    const isActiveCollection = isCollection && best.openClosed === "Open";
    const isSettled      = /settled|paid/i.test(best.payStatusLabel);
    const isAU           = /authorized|participant/i.test(best.designator);

    // Utilization (revolving only)
    const utilPct = (isRevolving && limit > 0)
      ? Math.round((balance / limit) * 100)
      : null;

    // Negative category
    let negCategory = null;
    if (isNegative) {
      const lbl = best.payStatusLabel ?? "";
      if (/collection/i.test(lbl) || isCollection)  negCategory = "COLLECTION";
      else if (/charge.?off/i.test(lbl))             negCategory = "COLLECTION";
      else if (/late|past.?due/i.test(lbl))          negCategory = "LATE_PAYMENT";
      else                                            negCategory = "DEROGATORY";
    }

    // Remarks as string
    const remarkStr = best.remarks
      .map(r => r?.RemarkCode?.abbreviation ?? r?.customRemark ?? "")
      .filter(Boolean).join("; ") || "Provided";

    // Determine late detail label
    let lateDetail = "";
    if (best.late90 > 0) lateDetail = `Late-120+`;
    else if (best.late60 > 0) lateDetail = `Late-60`;
    else if (best.late30 > 0) lateDetail = `Late-30`;

    // Dedup key
    const mk  = nameKey(best.creditorName);
    const ak  = acctKey(best.accountNumber);
    const key = `${mk}_${ak}`;

    if (accountIndex.has(key)) {
      // Merge bureau info into existing account (handles same account in multiple partitions)
      const existing = mergedAccounts[accountIndex.get(key)];
      for (const b of bureaus) {
        if (!existing.bureaus.includes(b)) existing.bureaus.push(b);
      }
      existing.bureaus.sort();
      existing.bureau = existing.bureaus.join(", ");
      existing.balance = Math.max(existing.balance, balance);
      existing.limit   = Math.max(existing.limit, limit);
      continue;
    }

    accountIndex.set(key, mergedAccounts.length);

    const account = {
      // Identity
      name:           best.creditorName,
      account:        best.creditorName,
      account_name:   best.creditorName,
      account_num:    best.accountNumber,
      account_number: best.accountNumber,

      // Bureau
      bureau:  bureauStr,
      bureaus,

      // Status
      status:          best.payStatusLabel,
      account_status:  best.openClosed,
      payment_status:  best.payStatusLabel,

      // Financials
      monthly_payment: best.monthlyPayment,
      balance,
      limit,
      pastDue,
      high_balance:    best.highBalance,

      // Dates
      opened:     best.dateOpened,
      dateOpened: best.dateOpened,
      dateReported: best.dateReported,
      dateLastPayment: best.dateLastPayment,
      dateClosed: best.dateClosed,

      // Type
      type: parseCreditType(best.creditTypeSymbol, best.creditTypeLabel),
      industry: best.industryCode,

      // Structural flags
      is_au:                 isAU,
      ownership:             best.designator,
      is_revolving:          isRevolving,
      is_installment:        isInstallment,
      is_active_collection:  isActiveCollection,
      is_charge_off:         isChargeOff,
      is_settled:            isSettled,
      is_negative:           isNegative,
      is_positive:           isPositive,

      // Scoring
      tags: [],
      utilization_pct:    utilPct,
      utilization_status: utilizationStatus(utilPct),
      severity,

      // Detail
      details:  "Provided",
      remarks:  remarkStr,

      // Late counts (useful for dispute analysis)
      late_30_count: Math.max(...bureauEntries.map(e => e.late30)),
      late_60_count: Math.max(...bureauEntries.map(e => e.late60)),
      late_90_count: Math.max(...bureauEntries.map(e => e.late90)),

      // Payment history string
      pay_status_history: best.payStatusHistory,
      monthly_pay_statuses: best.monthlyPayStatuses,

      // Negative category
      _neg_category: negCategory,
      _late_detail:  lateDetail,
    };

    mergedAccounts.push(account);
  }

  // ── 5. INQUIRIES ─────────────────────────────────────────────────────────────
  const inquiryPartitions = reportData?.InquiryPartition ?? [];
  const inquiries = [];

  for (const ip of inquiryPartitions) {
    const inq = ip?.Inquiry ?? ip;
    const bureauRaw = inq?.bureau ?? inq?.Source?.Bureau?.abbreviation ?? inq?.Source?.Bureau?.symbol;
    const bureau = normalizeBureau(bureauRaw);

    inquiries.push({
      creditor: inq?.subscriberName ?? "Unknown",
      date:     inq?.inquiryDate    ?? null,
      bureau:   bureau ?? "Unknown",
      bureaus:  bureau ? [bureau] : [],
      type:     inq?.IndustryCode?.abbreviation ?? inq?.inquiryType ?? "",
    });
  }

  // ── 6. PUBLIC RECORDS ────────────────────────────────────────────────────────
  // IdentityIQ buries public records inside TradelinePartitions with specific symbols,
  // or as PublicRecordPartition if present
  const publicRecordPartitions = reportData?.PublicRecordPartition ?? [];
  const public_records = [];

  for (const prp of publicRecordPartitions) {
    const pr = prp?.PublicRecord ?? prp;
    const bureauRaw = pr?.bureau ?? pr?.Source?.Bureau?.abbreviation ?? pr?.Source?.Bureau?.symbol;
    const bureau = normalizeBureau(bureauRaw);

    let rawType = String(pr?.publicRecordType ?? pr?.Type?.abbreviation ?? pr?.Type?.description ?? "Unknown").toLowerCase();
    let finalType = "Public Record";

    if (rawType.includes("bankruptcy") || rawType.includes("chapter")) {
      if (rawType.includes("7"))       finalType = "Bankruptcy (Chapter 7)";
      else if (rawType.includes("13")) finalType = "Bankruptcy (Chapter 13)";
      else if (rawType.includes("11")) finalType = "Bankruptcy (Chapter 11)";
      else                             finalType = "Bankruptcy Record";
    } else if (rawType.includes("lien") || rawType.includes("tax")) {
      finalType = rawType.includes("state") ? "State Tax Lien" : "Federal Tax Lien";
    } else if (rawType.includes("judgment") || rawType.includes("civil")) {
      finalType = "Civil Judgment";
    } else {
      finalType = pr?.publicRecordType ?? pr?.Type?.abbreviation ?? "Unknown";
    }

    public_records.push({
      type:             finalType,
      bureau:           bureau ?? "Unknown",
      date_filed:       pr?.dateFiled ?? pr?.dateReported ?? null,
      reference_number: pr?.referenceNumber ?? pr?.caseNumber ?? "",
      amount:           parseFloat(pr?.liabilityAmount ?? pr?.amount ?? 0) || 0,
      status:           pr?.status ?? (pr?.DischargeDate ? "Discharged" : "Filed"),
    });
  }

  // Hidden bankruptcy fallback: if Factor Code 98 fired but no public record was found
  if (bankruptcyDetectedViaFactors && public_records.length === 0) {
    public_records.push({
      type:             "Bankruptcy Chapter 7 or 13 (Derived)",
      bureau:           "EX, TU, EQ",
      date_filed:       "Unspecified",
      reference_number: "Factor Code 98",
      amount:           0,
      status:           "Active Discrepancy Signal",
    });
  }

// ── 7. NEGATIVES ─────────────────────────────────────────────────────────────
  const negatives = mergedAccounts
    .filter(a => a.is_negative)
    .map(a => ({
      category:       a._neg_category ?? "DEROGATORY",
      name:           a.name,
      account:        a.name,
      account_name:   a.name,
      account_num:    a.account_num,
      account_number: a.account_num,
      bureau:         a.bureau,
      bureaus:        a.bureaus,
      detail:         a._late_detail || a.status,
      reason:         [
        a.payment_status,
        a._late_detail,
        a.pastDue > 0 ? `Prior Past Due` : null,
      ].filter(Boolean).join(", "),
      date:           a.dateReported ?? a.dateLastPayment ?? null,
      balance:        a.balance,
      severity:       a.severity,
      action:         a.severity === "High" ? "Dispute" : "Monitor",
    }));

  // 👇 ADD THIS TO INJECT PUBLIC RECORDS INTO THE DEROGATORY ITEMS LIST 👇
  public_records.forEach(pr => {
    negatives.push({
      category: 'PUBLIC_RECORD',
      name: pr.type,
      account: pr.type,
      account_name: pr.type,
      account_num: pr.reference_number,
      account_number: pr.reference_number,
      bureau: pr.bureau,
      bureaus: pr.bureau.split(',').map(b => b.trim()), 
      detail: `${pr.type} (${pr.status})`,
      reason: pr.type,
      date: pr.date_filed,
      balance: pr.amount,
      severity: 'High',
      action: 'Dispute / Verify'
    });
  });

  // ── 8. SUMMARY ───────────────────────────────────────────────────────────────
  const summaryNode = reportData?.Summary ?? {};
  const tradelineSummary = summaryNode?.TradelineSummary ?? {};
  const inquirySummary   = summaryNode?.InquirySummary  ?? {};
  const bureauSummaryRaw = {
    EX: tradelineSummary?.Experian  ?? {},
    TU: tradelineSummary?.TransUnion ?? {},
    EQ: tradelineSummary?.Equifax   ?? {},
  };

  // Compute revolving stats per bureau from account data (more accurate than summary)
  // Use per-account balances (already maxed across bureaus), don't double-count
  const revolvingByBureau = { EX: {}, TU: {}, EQ: {} };
  for (const b of ["EX", "TU", "EQ"]) {
    const revolvers = mergedAccounts.filter(a => a.is_revolving && a.bureaus.includes(b));
    // Each account's balance/limit already represents the merged max; avoid cross-bureau double-count
    // by dividing evenly across bureaus the account reports to
    const revLimit = revolvers.reduce((s, a) => {
      const share = (a.limit || 0) / (a.bureaus.length || 1);
      return s + share;
    }, 0);
    const revDebt = revolvers.reduce((s, a) => {
      const share = (a.balance || 0) / (a.bureaus.length || 1);
      return s + share;
    }, 0);
    revolvingByBureau[b] = {
      revolving_limit:   Math.round(revLimit),
      revolving_debt:    Math.round(revDebt),
    };
    revolvingByBureau[b].utilization_pct = revolvingByBureau[b].revolving_limit > 0
      ? Math.round((revolvingByBureau[b].revolving_debt / revolvingByBureau[b].revolving_limit) * 100)
      : 0;
  }

const bureau_stats = {};
  for (const b of ["EX", "TU", "EQ"]) {
    const raw = bureauSummaryRaw[b];
    const accountsForBureau = mergedAccounts.filter(a => a.bureaus.includes(b));
    
    // 👇 FIXED: Dynamically count arrays using .includes() to catch merged items like the hidden bankruptcy 👇
    const actualNegatives = negatives.filter(n => n.bureaus && n.bureaus.includes(b)).length;
    const actualPRs = public_records.filter(pr => pr.bureau && pr.bureau.includes(b)).length;

    bureau_stats[b] = {
      account_count:       parseInt(raw?.TotalAccounts ?? accountsForBureau.length, 10),
      positive_count:      accountsForBureau.filter(a => a.is_positive).length,
      negative_count:      Math.max(parseInt(raw?.DerogatoryAccounts ?? 0, 10), actualNegatives), // Takes the true total
      inquiry_count:       parseInt(inquirySummary?.[{ EX: "Experian", TU: "TransUnion", EQ: "Equifax" }[b]]?.NumberInLast2Years ?? 0, 10),
      public_record_count: actualPRs, // 👈 Injects the correct merged record count
      revolving_limit:     revolvingByBureau[b].revolving_limit,
      revolving_debt:      revolvingByBureau[b].revolving_debt,
      utilization_pct:     revolvingByBureau[b].utilization_pct,
    };
  }

  // Total revolving: sum directly from the deduplicated merged account list
  const allRevolvers = mergedAccounts.filter(a => a.is_revolving);
  const totalRevolving = {
    limit: allRevolvers.reduce((s, a) => s + (a.limit   || 0), 0),
    debt:  allRevolvers.reduce((s, a) => s + (a.balance || 0), 0),
  };

  const mergeSummary = tradelineSummary?.Merge ?? {};

  const inquiries6mo  = inquiries.filter(i => {
    if (!i.date) return false;
    const d = new Date(i.date);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    return d >= cutoff;
  }).length;

  const inquiries24mo = inquiries.filter(i => {
    if (!i.date) return false;
    const d = new Date(i.date);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    return d >= cutoff;
  }).length;

  const totalDebt = parseInt(mergeSummary?.TotalBalances ?? 0, 10)
    || mergedAccounts.reduce((s, a) => s + a.balance, 0);

  const summary = {
    total_accounts:       parseInt(mergeSummary?.TotalAccounts ?? mergedAccounts.length, 10),
    open_accounts:        parseInt(mergeSummary?.OpenAccounts  ?? mergedAccounts.filter(a => a.account_status === "Open").length, 10),
    total_debt:           totalDebt,
    total_revolving_limit: totalRevolving.limit,
    total_revolving_debt:  totalRevolving.debt,
    total_available:       Math.max(0, totalRevolving.limit - totalRevolving.debt),
    utilization_pct:       totalRevolving.limit > 0
      ? Math.round((totalRevolving.debt / totalRevolving.limit) * 100) : 0,
    inquiries_6mo:   inquiries6mo,
    inquiries_24mo:  inquiries24mo,
    negatives_count: negatives.length,
  };

  // ── 9. UTILIZATION BREAKDOWN (revolving only) ─────────────────────────────
  // Extra structure for the revolving/utilization component
  const utilization_breakdown = mergedAccounts
    .filter(a => a.is_revolving)
    .map(a => ({
      name:            a.name,
      account_num:     a.account_num,
      bureau:          a.bureau,
      bureaus:         a.bureaus,
      balance:         a.balance,
      limit:           a.limit,
      available:       Math.max(0, a.limit - a.balance),
      utilization_pct: a.utilization_pct,
      utilization_status: a.utilization_status,
      is_negative:     a.is_negative,
      account_status:  a.account_status,
    }))
    .sort((a, b) => (b.utilization_pct ?? 0) - (a.utilization_pct ?? 0));

  // ── 10. META ─────────────────────────────────────────────────────────────────
  const auditDate = reportData?.Sources?.Source?.[0]?.InquiryDate ?? null;
  const meta = {
    source:     "IdentityIQ",
    audit_date: auditDate ? `${auditDate}T00:00:00.000Z` : new Date().toISOString(),
    version:    "3.0",
  };

  // ── FINAL PAYLOAD ────────────────────────────────────────────────────────────
  return {
    meta,
    personal,
    personal_info: uniquePersonalInfo,
    scores,
    summary,
    bureau_stats,
    accounts:       mergedAccounts.map(a => {
      // Strip internal _ fields before returning
      const { _neg_category, _late_detail, ...rest } = a;
      return rest;
    }),
    negatives,
    inquiries,
    public_records,
    utilization_breakdown,
  };
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

// CommonJS / Node
if (typeof module !== "undefined") {
  module.exports = { parseSmartCredit };
}

// ESM
export { parseSmartCredit };
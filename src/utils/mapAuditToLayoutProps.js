// src/utils/mapAuditToLayoutProps.js

export function mapAuditToLayoutProps(payload, options = {}) {
  const p = payload || {};
  const pdf = p.pdfData || p; 

  const BUREAU_MAP = { EX: "Experian", TU: "TransUnion", EQ: "Equifax" };

  // ----- 1. CLIENT INFO -----
  // Fallback to pdf.personal if DB client object isn't fully populated
  const clientNode = options.client || pdf.client || {};
  const personalNode = pdf.personal || {};
  
  const clientName = options.clientName || clientNode.full_name || (personalNode.names && personalNode.names[0]) || "Client Name";
  const clientAddress = clientNode.address || "";
  const clientDob = (clientNode.dob || "").replace(/-/g, "/") || "";
  const clientSsnLast4 = clientNode.ssn_last4 || (personalNode.ssn ? personalNode.ssn.slice(-4) : "");
  const createdDate = (pdf.meta && pdf.meta.audit_date) 
    ? new Date(pdf.meta.audit_date).toLocaleDateString() 
    : new Date().toLocaleDateString();

  // ----- 2. SCORES -----
  const sc = pdf.scores || {};
  const getScoreVal = (val) => (val && typeof val === 'object' ? Number(val.score || 0) : Number(val || 0));
  const exp = getScoreVal(sc.EX || sc.exp);
  const tu  = getScoreVal(sc.TU || sc.tu);
  const eq  = getScoreVal(sc.EQ || sc.eq);
  const validScores = [exp, tu, eq].filter((x) => x > 0);
  const avg = validScores.length ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;

  // ----- 3. BUREAU SUMMARIES -----
  const bStats = pdf.bureau_stats || { EX: {}, TU: {}, EQ: {} };
  const safeStat = (bureau, key) => (bStats[bureau] && bStats[bureau][key]) || 0;
  
  const bureauSummaries = [
    { 
        bureau: "Experian", 
        accounts: safeStat("EX", "account_count"), 
        positive: safeStat("EX", "positive_count"), 
        negative: safeStat("EX", "negative_count"), 
        inquiries: safeStat("EX", "inquiry_count"), 
        utilization: safeStat("EX", "utilization_pct") 
    },
    { 
        bureau: "TransUnion", 
        accounts: safeStat("TU", "account_count"), 
        positive: safeStat("TU", "positive_count"), 
        negative: safeStat("TU", "negative_count"), 
        inquiries: safeStat("TU", "inquiry_count"), 
        utilization: safeStat("TU", "utilization_pct") 
    },
    { 
        bureau: "Equifax", 
        accounts: safeStat("EQ", "account_count"), 
        positive: safeStat("EQ", "positive_count"), 
        negative: safeStat("EQ", "negative_count"), 
        inquiries: safeStat("EQ", "inquiry_count"), 
        utilization: safeStat("EQ", "utilization_pct") 
    }
  ];

  // ----- 4. UTILIZATION -----
  const utilData = p.summary || {};
  const utilPct = utilData.utilization_pct || 0;
  
  let utilLabel = "Excellent";
  if (utilPct >= 75) utilLabel = "Very Poor";
  else if (utilPct >= 50) utilLabel = "Poor";
  else if (utilPct >= 30) utilLabel = "Fair";
  else if (utilPct >= 10) utilLabel = "Good";

  const utilization = {
    utilizationNote: utilPct >= 30 ? "High Credit Card Usage Detected" : "Utilization is within healthy limits.",
    percent: `${Math.round(utilPct)}%`,
    category: utilLabel,
    available: toMoney(utilData.total_available || 0), 
    balance: toMoney(utilData.total_revolving_debt || 0),
    monitorReminder: "It Is Important To Keep Your Credit Monitoring Account Active..."
  };

  // ----- Helper for extracting bureaus robustly -----
  const parseBureaus = (item) => {
      let arr = [];
      if (Array.isArray(item.bureaus) && item.bureaus.length > 0) arr = item.bureaus;
      else if (typeof item.bureau === 'string') arr = item.bureau.split(',').map(s => s.trim());
      else if (item.bureau) arr = [item.bureau];
      return arr.map(b => BUREAU_MAP[b] || b);
  };

  // ----- 5. LISTS (Consolidated) -----
  
  // Map consolidated inquiries
  const inquiries = (pdf.inquiries || []).map((q) => ({ 
      name: q.creditor, 
      date: q.date, 
      label: "Inquiry",
      bureau: parseBureaus(q).join(', '), 
      impact: "Negative Impact"
  }));

  // Map consolidated accounts
  const layoutAccounts = (pdf.accounts || []).map(a => mapAccountForLayout(a, parseBureaus));

  // Map consolidated negatives
  const derogatoryItems = (pdf.negatives || []).map(n => ({
      accountName: n.name,
      bureaus: parseBureaus(n),
      issue: n.reason || n.category,
      details: n.detail || "",
      severity: n.severity || "Medium"
  }));

  // ----- 6. DYNAMIC COUNTS FOR UI DASHBOARD WIDGETS -----
  const derogCounts = {
      delinquent: { Experian: 0, TransUnion: 0, Equifax: 0 }, 
      derogatory: { Experian: safeStat("EX", "negative_count"), TransUnion: safeStat("TU", "negative_count"), Equifax: safeStat("EQ", "negative_count") },
      collection: { Experian: 0, TransUnion: 0, Equifax: 0 }, 
      publicRecords: { Experian: 0, TransUnion: 0, Equifax: 0 },
      inquiries2yr: { Experian: safeStat("EX", "inquiry_count"), TransUnion: safeStat("TU", "inquiry_count"), Equifax: safeStat("EQ", "inquiry_count") } 
  };
  
  // Dynamically populate actual categories from the negatives array!
  (pdf.negatives || []).forEach(neg => {
      const mappedBureaus = parseBureaus(neg);
      mappedBureaus.forEach(bureauName => {
          if (neg.category === 'LATE_PAYMENT') derogCounts.delinquent[bureauName] = (derogCounts.delinquent[bureauName] || 0) + 1;
          if (neg.category === 'COLLECTION') derogCounts.collection[bureauName] = (derogCounts.collection[bureauName] || 0) + 1;
          if (neg.category === 'PUBLIC_RECORD') derogCounts.publicRecords[bureauName] = (derogCounts.publicRecords[bureauName] || 0) + 1;
      });
  });
  
  return {
    title: "Credit Audit Report Prepared for",
    clientName, clientAddress, clientDob, clientSsnLast4, createdDate,
    scores: { exp, tu, eq, avg },
    scoreFactors: [],
    bureauSummaries,
    utilization,
    derogatorySummary: {
      counts: derogCounts,
      items: derogatoryItems
    },
    publicRecords: pdf.public_records || [],
    inquiries,
    accounts: layoutAccounts,
    expertise: "While we cannot promise to remove all of the negative items...",
    planOfAction: "The law gives you the right to dispute any item...",
    education: "We will be drafting many letters on your behalf...",
    nextSteps: [ "Upload Photo ID...", "Keep utilization under 9–11%...", "Avoid new applications..." ],
    speedUp: [ "Stop applying for credit...", "Do not close any accounts...", "Pay your credit cards down..." ],
    expectations: [ "It takes 30 to 45 days...", "You'll receive real-time updates..." ],
    closingIntro: "Just reach out to us...",
    closingNotes: ["We appreciate that you choose us..."],
    calls: options.calls || [],
    docs: options.docs || []
  };
}

// Helper
function toMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function mapAccountForLayout(a, parseBureausFn) {
  const bureaus = parseBureausFn(a).filter(b => ["Experian", "TransUnion", "Equifax"].includes(b));

  return {
    name: a.name || "—",
    bureaus: bureaus, 
    type: a.type || "Unknown",
    openClosed: a.account_status || "Unknown",
    status: a.status || "Unknown",
    limit: a.limit || 0,
    balance: a.balance || 0,
    pastDue: a.pastDue || 0, // 👇 Mapped directly from raw past-due counters
    dateOpened: a.opened || "",
    tags: a.tags || [],
    is_revolving: a.is_revolving || false,     // 👈 Passes down revolving flags cleanly
    is_installment: a.is_installment || false, // 👈 Passes down installment flags cleanly
    is_active_collection: a.is_active_collection || false,
    is_settled: a.is_settled || false,
    dispute_type: a.dispute_type || "None",
    details: a.details || "",
    utilization_label: a.utilization_status,
    is_negative: a.is_negative,
    notes: a.remarks || ""
  };
}
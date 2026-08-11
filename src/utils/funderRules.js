// src/utils/funderRules.js

// Default thresholds if nothing is passed from the UI sliders
const DEFAULTS = {
  inquiryMonths: 6,      // Look back X months for inquiries
  maxUtil: 35,           // Max utilization % for Green
  minAccts: 5,           // Min PRIMARY open revolving accounts
  maxInqCount: 2         // Max allowed inquiries in the lookback period
};

export function calculateFundingEligibility(parsedData, userOptions = {}) {
  try {
    if (!parsedData || !parsedData.accounts) throw new Error("Invalid parsed data provided to Funder Engine.");
    
    // Merge user options with defaults
    const options = { ...DEFAULTS, ...userOptions };
    const reportDate = new Date(parsedData.meta?.audit_date || Date.now());

    // 1. EXTRACT CORE METRICS FROM CLEAN PARSER OUTPUT
    const utilization = parsedData.summary?.utilization_pct || 0;
    
    // Count PRIMARY open revolving accounts (ignores AUs!)
    const openRevolvingCount = parsedData.accounts.filter(a => 
      a.is_revolving === true && 
      a.is_au === false && 
      String(a.account_status).toLowerCase().includes("open")
    ).length;

    // Inquiries Velocity
    const cutoffDate = new Date(reportDate);
    cutoffDate.setMonth(cutoffDate.getMonth() - options.inquiryMonths);
    
    const inqTotal = (parsedData.inquiries || []).length;
    const inqRecent = (parsedData.inquiries || []).filter(iq => {
      if (!iq.date) return false; 
      return new Date(iq.date) >= cutoffDate;
    }).length;

    // Hazards (Derogatories & Bankruptcies)
    const derogs = (parsedData.negatives || []).length;
    const bankruptcies = (parsedData.public_records || []).filter(pr => 
      String(pr.type).toLowerCase().includes("bankruptcy")
    ).length;

    // Mortgage Seasoning (Equity Bonus)
    let mortYears = 0;
    parsedData.accounts.filter(a => a.is_installment && String(a.type).toLowerCase().includes("mortgage")).forEach(acc => {
       const opened = new Date(acc.opened || acc.dateOpened);
       if (!isNaN(opened.getTime())) {
           const age = (reportDate - opened) / (1000 * 60 * 60 * 24 * 365);
           if (age > mortYears) mortYears = Math.floor(age);
       }
    });

    // 2. RUN THE DECISION ENGINE (GREEN / YELLOW / RED)
    let overallStatus = "GREEN"; 
    let reasons = [];
    let score = "Fast Pass Eligible";

    // RULE 1: UTILIZATION
    if (utilization > (options.maxUtil + 10)) {
      overallStatus = "RED";
      reasons.push({ text: `Critical Utilization (${utilization}%)`, status: "RED" });
    } else if (utilization > options.maxUtil) {
      if (overallStatus !== "RED") overallStatus = "YELLOW";
      reasons.push({ text: `High Utilization (${utilization}%) > ${options.maxUtil}%`, status: "YELLOW" });
    } else {
      reasons.push({ text: `Utilization Good (${utilization}%)`, status: "GREEN" });
    }

    // RULE 2: ACCOUNT DEPTH (Primary only)
    if (openRevolvingCount < options.minAccts) {
      if (overallStatus !== "RED") overallStatus = "YELLOW";
      reasons.push({ text: `Thin File (${openRevolvingCount} < ${options.minAccts} primary open accts)`, status: "YELLOW" });
    } else {
      reasons.push({ text: `Strong File Depth (${openRevolvingCount} Primary Accts)`, status: "GREEN" });
    }

    // RULE 3: INQUIRY VELOCITY
    if (inqRecent > options.maxInqCount) {
      overallStatus = "RED";
      reasons.push({ text: `High Velocity (${inqRecent} in ${options.inquiryMonths}mo)`, status: "RED" });
    } else {
      reasons.push({ text: `Inquiries Acceptable (${inqRecent} recent)`, status: "GREEN" });
    }

    // RULE 4: DEROGATORY HAZARDS
    if (derogs > 0) {
      overallStatus = "RED";
      reasons.push({ text: `${derogs} Major Derogatories Found`, status: "RED" });
    } else {
      if (overallStatus === "GREEN") {
        reasons.push({ text: "Clean History (No Major Derogs)", status: "GREEN" });
      }
    }

    // RULE 5: BANKRUPTCY OVERRIDE
    if (bankruptcies > 0) {
      overallStatus = "RED";
      reasons.push({ text: `Prior Bankruptcy File Active (${bankruptcies} record found)`, status: "RED" });
    }

    // RULE 6: EQUITY MODIFIER
    if (mortYears >= 5) {
      reasons.push({ text: "Strong Equity Signal (Seasoned Mtg)", status: "GREEN" });
    }

    // Final Overall Score Text
    if (overallStatus === "RED") score = "Stop / High Risk";
    if (overallStatus === "YELLOW") score = "Manual Review";

    return {
      status: overallStatus,
      score,
      reasons, 
      metrics: {
        utilization,
        revolving_accounts: openRevolvingCount,
        inquiries_recent: inqRecent,
        inquiries_total: inqTotal, 
        derogatories: derogs,
        mortgage_seasoning: mortYears,
        bankruptcies: bankruptcies
      },
      criteria: options 
    };

  } catch (err) {
    console.error("Funder Engine Error:", err);
    throw new Error("Failed to process underwriting rules: " + err.message);
  }
}
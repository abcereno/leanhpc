// uiTransformers.js
import { calculateFundingEligibility } from './utils/funderRules';

export function prepareDataForUI(rawJson, underwritingSettings) {
  // 1. Run your core parser
  const parsedReport = parseSmartCredit(rawJson);
  
  // 2. Run your underwriting calculations needed for Eligibility & Blueprint
  const eligibilityResult = calculateFundingEligibility(parsedReport, underwritingSettings);
  const ageMetrics = calculateAgeMetrics(parsedReport.accounts); // Assuming helper visibility

  // 3. Build the specific props expected by CreditAuditLayout
  const creditAuditProps = {
    clientName: parsedReport.personal.full_name,
    clientAddress: parsedReport.personal.address,
    clientDob: parsedReport.personal.dob,
    clientSsnLast4: parsedReport.personal.ssn_last4,
    scores: {
      exp: parsedReport.scores.EX || "—",
      tu: parsedReport.scores.TU || "—",
      eq: parsedReport.scores.EQ || "—",
      avg: parsedReport.scores.avg || "—"
    },
    // Convert object map into the array layout expects
    bureauSummaries: Object.entries(parsedReport.bureau_stats).map(([key, stats]) => ({
      bureau: key === "EX" ? "Experian" : key === "TU" ? "TransUnion" : "Equifax",
      accounts: stats.account_count,
      inquiries: stats.inquiry_count,
      publicRecords: 0, // Fallback placeholder
      collections: stats.negative_count, // Or map cleanly based on classification
      positive: stats.positive_count,
      negative: stats.negative_count
    })),
    utilization: {
      percent: `${parsedReport.summary.utilization_pct}%`,
      balance: `$${parsedReport.summary.total_revolving_debt.toLocaleString()}`,
      available: `$${parsedReport.summary.total_available.toLocaleString()}`
    },
    derogatorySummary: {
      counts: {
        delinquent: {
          Equifax: parsedReport.bureau_stats.EQ?.closed_count || 0, // Map accordingly
          TransUnion: parsedReport.bureau_stats.TU?.closed_count || 0,
          Experian: parsedReport.bureau_stats.EX?.closed_count || 0,
        },
        // etc... Match layout schemas cleanly
      },
      items: parsedReport.negatives.map(neg => ({
        accountName: neg.name,
        bureaus: neg.bureaus,
        issue: neg.reason
      }))
    },
    scoreFactors: parsedReport.scoreFactors.map(f => ({
      question: `${f.bureau} ${f.type} Factor:`,
      note: f.factor
    })),
    inquiries: parsedReport.inquiries.map(inq => ({
      name: inq.creditor,
      date: inq.date,
      bureau: inq.bureau,
      label: "Hard Inquiry"
    }))
  };

  return {
    parsedReport,       // Use this for raw data loops / fallback structures
    creditAuditProps,   // Pass explicitly as {...creditAuditProps} to CreditAuditLayout
    eligibilityResult,  // Pass directly to FunderEligibilityCard or FundingBlueprintReport
    ageMetrics          // Pass directly to FundingBlueprintReport
  };
}
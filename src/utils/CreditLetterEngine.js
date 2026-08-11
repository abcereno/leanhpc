// CreditLetterEngine.js

export const BUREAU_ADDRESSES = {
  Experian: "P.O. Box 4500\nAllen, TX 75013",
  Equifax: "P.O. Box 740256\nAtlanta, GA 30374",
  TransUnion: "P.O. Box 2000\nChester, PA 19016"
};

export const METRO_2_REASONS = [
  "Account status conflicts with reported balance.",
  "Payment history does not align with current account status.",
  "Date of First Delinquency and Date of Last Activity appear inconsistent.",
  "Account is reporting as charged off while continuing to show inconsistent balance activity.",
  "Account reports both closed and active/current information.",
  "Collection account is missing original creditor information.",
  "Balance differs between bureaus.",
  "Account status differs between bureaus.",
  "Payment history grid contains inconsistent late payment reporting.",
  "Account reports a balance after bankruptcy discharge.",
  "Account reports collection activity after bankruptcy inclusion.",
  "Account reports an inaccurate open date.",
  "Account reports an inaccurate last reported date.",
  "Account shows duplicate reporting with another tradeline."
];

export const TEMPLATES = {
  round_1_initial_investigation: `{{consumer_name}}
{{consumer_address}}
{{consumer_city_state_zip}}
{{date}}

{{bureau_name}}
{{bureau_address}}

RE: Initial Investigation Request

To Whom It May Concern,
I am disputing the accuracy of the following account:

Account Name: {{account_name}}
Account Number: {{account_number}}

Reason for dispute:
{{dispute_reason}}

This account contains inaccurate, incomplete, or unverifiable information. Please conduct a reasonable investigation and delete or correct the account if it cannot be verified as accurate.

Sincerely,
{{consumer_name}}`,

  round_2_method_of_verification: `{{consumer_name}}
{{consumer_address}}
{{consumer_city_state_zip}}
{{date}}

{{bureau_name}}
{{bureau_address}}

RE: Method of Verification Request

To Whom It May Concern,
I previously disputed the following account, and your response stated that the account was verified:

Account Name: {{account_name}}
Account Number: {{account_number}}

Please provide the method of verification used, including:
- The name of the entity contacted
- The method used to verify the account
- The documentation reviewed
- The date verification was completed

If you cannot provide this information, please delete the account from my credit report.

Sincerely,
{{consumer_name}}`,

  settlement_pay_for_delete: `{{consumer_name}}
{{consumer_address}}
{{consumer_city_state_zip}}
{{date}}

{{collector_name}}
{{collector_address}}

RE: Settlement Offer for Account

To Whom It May Concern,
I am willing to resolve the following account:

Account Name: {{account_name}}
Account Number: {{account_number}}
Current Balance: {{current_balance}}

I am offering {{settlement_amount}} as settlement of this account. This offer is contingent upon written confirmation that, upon receipt of payment, your company will request deletion of this account from all credit reporting agencies where it is currently being reported.

No payment will be made until written agreement is received.

Sincerely,
{{consumer_name}}`
  // Add the rest of your templates from the document here following this exact format...
};

export class CreditRepairEngine {
  
  /**
   * Smart Pay-For-Delete Calculator
   */
  static calculateSettlement(balance) {
    const numBalance = parseFloat(balance.replace(/[^0-9.-]+/g,""));
    if (isNaN(numBalance) || numBalance <= 0) return { amount: "$0", percentage: "0%" };

    let percentage = 0;
    if (numBalance < 500) percentage = 0.35; // Target 35%
    else if (numBalance >= 500 && numBalance <= 2000) percentage = 0.40; // Target 40%
    else percentage = 0.50; // Target 50%

    return {
      amount: `$${(numBalance * percentage).toFixed(2)}`,
      percentage: `${percentage * 100}%`
    };
  }

  /**
   * The Brain: Determines the exact letter strategy based on your rules
   */
  static determineStrategy(accountType, round, isFastResolution, priorVerification) {
    if (accountType === 'Collection') {
        if (isFastResolution) return 'settlement_pay_for_delete';
        if (round === 1) return 'round_1_initial_investigation';
        if (round === 2) return priorVerification ? 'round_2_3_metro2_dispute' : 'round_2_debt_validation_collector';
    }
    
    if (accountType === 'Charge-Off') {
        if (round === 1) return 'round_1_initial_investigation';
        if (round === 2) return 'round_2_3_metro2_dispute';
        if (round >= 3) return isFastResolution ? 'settlement_pay_for_delete' : 'round_3_fcra_violation_equifax_experian';
    }

    if (accountType === 'Late Payment') {
        if (round === 1) return 'round_1_late_payment_creditor';
        if (round >= 2) return 'round_2_method_of_verification';
    }

    if (accountType === 'Bankruptcy') {
        return round >= 2 ? 'bankruptcy_credit_report_update' : 'round_1_initial_investigation';
    }

    return 'round_1_initial_investigation'; // Default fallback
  }

  /**
   * The Compiler: Replaces all {{tags}} with actual data
   */
  static compileLetter(templateKey, data) {
    let template = TEMPLATES[templateKey];
    if (!template) return "Error: Template not found.";

    // Apply Settlement Logic if needed
    if (templateKey === 'settlement_pay_for_delete' && data.current_balance) {
      const settlement = this.calculateSettlement(data.current_balance);
      data.settlement_amount = settlement.amount;
      data.settlement_percentage = settlement.percentage;
    }

    // Replace all tags
    return template.replace(/\{\{(.*?)\}\}/g, (match, key) => {
      return data[key.trim()] || `[MISSING: ${key}]`;
    });
  }
}
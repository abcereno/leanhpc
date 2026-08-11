import { useCallback } from 'react';

const PARTNER_PRICING_CONFIG = {
  // --- STUDENT CREDIT / DENNIS PRICING ---
  "TRUSTED": {
    calculationType: "inquiry_tiers",
    inquiryTiers: [
      { max: 10,  total: 100 },
      { max: 25,  total: 150 },
      { max: 50,  total: 250 },
      { max: 75,  total: 350 },
      { max: 100, total: 500 },
      { max: 125, total: 575 },
      { max: 150, total: 650 },
      { max: 175, total: 800 }, 
      { max: 200, total: 950 },
      { max: 225, total: 1025 },
      { max: 250, total: 1175 }
    ]
  },

  // --- BROKER PRICING (Default for all other partners) ---
  "DEFAULT": {
    calculationType: "broker_matrix",
    inquiryTiers: [
      { max: 10,  total: 250 },
      { max: 25,  total: 350 },
      { max: 50,  total: 550 },
      { max: 75,  total: 850 },
      { max: 100, total: 1100 },
      { max: Infinity, total: 1100 } // Cap fallback
    ],
    fullFileTiers: [
      { max: 3,   total: 550,  includesAddOns: false },
      { max: 7,   total: 700,  includesAddOns: false },
      { max: 12,  total: 850,  includesAddOns: false },
      { max: 17,  total: 997,  includesAddOns: false },
      { max: 22,  total: 1150, includesAddOns: true },
      { max: Infinity, total: 1375, includesAddOns: true }
    ],
    bankruptcyFlatRate: 1850,
    addOns: {
      personalIdentifiers: 97,
      expeditedExperian: 115,
      fraudAlert: 97
    }
  }
};

export function usePricingCalculator() {
  const calculatePrice = useCallback((companyName, options = {}) => {
    const safeCompanyName = (companyName || "DEFAULT").trim().toUpperCase();
    const config = PARTNER_PRICING_CONFIG[safeCompanyName] || PARTNER_PRICING_CONFIG["DEFAULT"];

    const serviceType = options.serviceType || "activity_review"; 
    const count = options.count || 0;
    const selectedAddOns = options.selectedAddOns || {};

    let basePrice = 0;
    let surchargeAmount = 0;
    let addOnTotal = 0;
    let areAddOnsFree = false;

    // 1. TRUSTED (Dennis) Pricing
    if (config.calculationType === "inquiry_tiers") {
      const matchedTier = config.inquiryTiers.find(tier => count <= tier.max) || config.inquiryTiers[config.inquiryTiers.length - 1];
      basePrice = config.inquiryTiers[0].total; // Lowest tier represents the "Base"
      surchargeAmount = matchedTier.total - basePrice; 
    } 
    // 2. DEFAULT (Broker) Pricing
    else if (config.calculationType === "broker_matrix") {
      if (serviceType === "bankruptcy") {
        basePrice = config.bankruptcyFlatRate;
      } 
      else if (serviceType === "activity_review") {
        const matchedTier = config.inquiryTiers.find(tier => count <= tier.max) || config.inquiryTiers[config.inquiryTiers.length - 1];
        basePrice = config.inquiryTiers[0].total; 
        surchargeAmount = matchedTier.total - basePrice;
      } 
      else if (serviceType === "full_file") {
        const matchedTier = config.fullFileTiers.find(tier => count <= tier.max) || config.fullFileTiers[config.fullFileTiers.length - 1];
        basePrice = matchedTier.total;
        areAddOnsFree = matchedTier.includesAddOns;
      }

      if (!areAddOnsFree) {
        if (selectedAddOns.personal) addOnTotal += config.addOns.personalIdentifiers;
        if (selectedAddOns.expedited) addOnTotal += config.addOns.expeditedExperian;
        if (selectedAddOns.fraud) addOnTotal += config.addOns.fraudAlert;
      }
    }

    return {
      pricingModelApplied: safeCompanyName,
      basePrice,
      surchargeAmount,
      addOnTotal,
      grandTotal: basePrice + surchargeAmount + addOnTotal
    };
  }, []);

  return { calculatePrice, PARTNER_PRICING_CONFIG };
}
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Spinner, Container, Alert, Button } from "react-bootstrap";
import { useClient } from "../../../hooks/useClient"; 
import FundingBlueprintReport from "./FundingBlueprintReport"; 
import { calculateFundingEligibility } from "../../../utils/funderRules";
import { parseSmartCredit } from "../../../utils/parseSmartCredit"; 
import { supabase } from "../../../supabaseClient"; 

const STORAGE_BUCKET = "clients";

// --- HELPER: UNIVERSAL SCORE EXTRACTOR (TRANSLATES EX/TU/EQ TO THE UI FORMAT) ---
const extractScoresSafely = (rawData, cleanData) => {
  let scores = { exp: "N/A", tu: "N/A", eq: "N/A" };
  
  // 1. Check typical parsed structures (Objects)
  const potentialScoreSources = [
      cleanData?.scores,
      cleanData?.summary?.scores,
      cleanData?.summary?.credit_scores,
      rawData?.pdfData?.scores,
      rawData?.scores
  ];

  for (const src of potentialScoreSources) {
      if (src && typeof src === 'object' && !Array.isArray(src)) {
          // Check for uppercase (from parser) AND lowercase (just in case)
          if (src.EX || src.exp || src.Experian || src.experian) scores.exp = src.EX || src.exp || src.Experian || src.experian;
          if (src.TU || src.tu || src.TransUnion || src.transunion || src.TUC) scores.tu = src.TU || src.tu || src.TransUnion || src.transunion || src.TUC;
          if (src.EQ || src.eq || src.Equifax || src.equifax || src.EQF) scores.eq = src.EQ || src.eq || src.Equifax || src.equifax || src.EQF;
          
          if (scores.exp !== "N/A" || scores.tu !== "N/A" || scores.eq !== "N/A") return scores;
      }
  }

  // 2. Check Raw SmartCredit Format (BundleComponents)
  try {
      const components = rawData?.BundleComponents?.BundleComponent || rawData?.report?.BundleComponents?.BundleComponent || [];
      components.forEach(c => {
          if (c.CreditScoreType?.riskScore) {
              const bureau = String(c.CreditScoreType?.Source?.SourceType?.abbreviation || "").toLowerCase();
              const score = c.CreditScoreType.riskScore;
              if (bureau.includes("exp")) scores.exp = score;
              else if (bureau.includes("tuc") || bureau.includes("trn") || bureau.includes("tu")) scores.tu = score;
              else if (bureau.includes("equ") || bureau.includes("eq")) scores.eq = score;
          }
      });
      if (scores.exp !== "N/A" || scores.tu !== "N/A" || scores.eq !== "N/A") return scores;
  } catch(e) {}

  // 3. Check Raw IdentityIQ Format (Arrays)
  try {
      const idiqScores = rawData?.CreditScores || rawData?.Score || rawData?.report?.CreditScores || cleanData?.credit_scores || [];
      if (Array.isArray(idiqScores)) {
          idiqScores.forEach(s => {
              const bureau = String(s.bureau || s.Bureau || s.Name || "").toLowerCase();
              const score = s.score || s.Score || s.riskScore;
              if (bureau.includes("exp")) scores.exp = score;
              else if (bureau.includes("tu") || bureau.includes("trans")) scores.tu = score;
              else if (bureau.includes("eq") || bureau.includes("equi")) scores.eq = score;
          });
      }
  } catch (e) {}

  return scores;
};

// --- HELPER: FICO STANDARD CREDIT AGE CALCULATION ---
const calculateAgeMetrics = (accounts) => {
  if (!accounts || !accounts.length) return null;
  const ageAccts = accounts.filter(a => !a.is_active_collection);
  if (!ageAccts.length) return { averageMonths: 0, oldestMonths: 0, accounts: [] };

  const now = new Date();
  let totalMonths = 0;
  let oldestMonths = 0;
  const validAccts = [];

  ageAccts.forEach(a => {
    const dateStr = a.dateOpened || a.opened || a.openedDate;
    if (dateStr) {
      const opened = new Date(dateStr);
      if (!isNaN(opened.getTime())) {
        const months = (now.getFullYear() - opened.getFullYear()) * 12 + (now.getMonth() - opened.getMonth());
        const finalMonths = Math.max(0, months);
        totalMonths += finalMonths;
        if (finalMonths > oldestMonths) oldestMonths = finalMonths;
        
        const name = a.name || a.accountName || a.creditorName || a.creditor || "Unknown Account";
        validAccts.push({ name: name, months: finalMonths });
      }
    }
  });

  return {
    averageMonths: validAccts.length ? Math.round(totalMonths / validAccts.length) : 0,
    oldestMonths,
    accounts: validAccts.sort((a, b) => b.months - a.months)
  };
};

export default function ClientFundingBlueprintPage() {
  const { clientId } = useParams();
  const { client, loading: clientLoading, error: clientError } = useClient(clientId);
  
  const [eligibilityResult, setEligibilityResult] = useState(null);
  const [ageMetrics, setAgeMetrics] = useState(null);
  const [clientScores, setClientScores] = useState(null); 
  
  const [processing, setProcessing] = useState(true);
  const [processError, setProcessError] = useState("");

  useEffect(() => {
    if (!client || !clientId) return;

    const fetchReportFromStorage = async () => {
      try {
        setProcessing(true);
        setProcessError("");
        let rawReportData = null;

        const reportPath = `${clientId}/client_audit_report.json`;
        console.log(`🔍 Pulling active audit file stream from: storage://${STORAGE_BUCKET}/${reportPath}`);

        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(reportPath);

        if (downloadError) {
          console.warn("Primary audit file missing, attempting historical fallbacks...", downloadError);
          
          const { data: fallbackBlob, error: fallbackError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(`${clientId}/raw_credit_report.json`);

          if (fallbackError) {
            throw new Error("No active credit report data file was found in storage for this client profile. Please open their file overview tab and click 'Import Report' first.");
          }
          
          const fallbackText = await fallbackBlob.text();
          rawReportData = JSON.parse(fallbackText);
        } else {
          const jsonText = await fileBlob.text();
          rawReportData = JSON.parse(jsonText);
        }

        const root = Array.isArray(rawReportData) ? rawReportData[0] : rawReportData;
        const isRaw = root.BundleComponents || root.report?.BundleComponents;
        
        const cleanParsedData = isRaw ? parseSmartCredit(root) : (root.pdfData || root);

        if (!cleanParsedData || !cleanParsedData.accounts) {
          throw new Error("Credit data file payload parsed as empty object mapping properties.");
        }

        // 👇 Extracted safely using our bulletproof translator tool
        const extractedScores = extractScoresSafely(root, cleanParsedData);
        setClientScores(extractedScores);

        const settings = { inquiryMonths: 6, maxInqCount: 2, maxUtil: 35, minAccts: 5 };
        const analysis = calculateFundingEligibility(cleanParsedData, settings);
        const ageCalculations = calculateAgeMetrics(cleanParsedData.accounts);

        setEligibilityResult(analysis);
        setAgeMetrics(ageCalculations);
      } catch (err) {
        console.error("Blueprint file recovery crash error:", err);
        setProcessError(err.message || "Failed to load active file stream data properties from system servers.");
      } finally {
        setProcessing(false);
      }
    };

    fetchReportFromStorage();
  }, [client, clientId]);

  if (clientLoading || processing) {
    return (
      <Container className="text-center py-5 mt-5">
        <Spinner animation="border" variant="primary" className="mb-3" />
        <h5 className="text-secondary font-monospace">Synchronizing Client Cloud Storage Files...</h5>
      </Container>
    );
  }

  if (clientError || processError) {
    return (
      <Container className="py-4">
        <Alert variant="danger" className="shadow-sm border-danger border-opacity-25">
          <Alert.Heading className="h5 fw-bold"><i className="bi bi-exclamation-triangle-fill me-2" />Blueprint Sync Interrupted</Alert.Heading>
          <p className="mb-0 small">{clientError || processError}</p>
        </Alert>
      </Container>
    );
  }

  const computedReportId = client.id ? `HPC-${client.id.slice(0, 5).toUpperCase()}` : "HPC-STATIC";

  return (
    <div className="bg-white min-vh-100 py-3 py-md-4">
      <Container fluid="lg" className="px-0 px-md-3">
        
        <div className="d-flex justify-content-between align-items-center mb-3 px-3 px-md-0 d-print-none">
          <Button variant="outline-secondary" size="sm" className="fw-bold" onClick={() => window.close()}>
            <i className="bi bi-arrow-left me-1" /> Close Window
          </Button>
          <Button variant="primary" size="sm" className="fw-bold px-3 shadow-sm" onClick={() => window.print()}>
            <i className="bi bi-printer-fill me-1" /> Print Blueprint Report
          </Button>
        </div>

        <FundingBlueprintReport 
          eligibilityResult={eligibilityResult}
          ageMetrics={ageMetrics}
          scores={clientScores}
          clientName={client.full_name}
          reportId={computedReportId}
        />

      </Container>
    </div>
  );
}
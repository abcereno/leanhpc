import React, { useState } from "react";
import { Button, Spinner } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { runAuditEngine } from "../../utils/auditEngine";
import { useToast } from "../shared/ui/ToastNotifier";

export default function RegenerateHistoryBtn({ clientId, onComplete }) {
  const { addToast } = useToast();
    const [loading, setLoading] = useState(false);

    const handleRegenerate = async () => {
        if (!confirm("This will rebuild your Start and Current progress snapshots from raw data. Continue?")) return;
        
        setLoading(true);
        try {
            const { data: files, error: listErr } = await supabase
                .storage
                .from("clients")
                .list(`${clientId}`, { limit: 100 });

            if (listErr) throw new Error("Could not list files.");

            const fileList = files || [];
            let processedCount = 0;

            const processAndSaveSnapshot = async (fileName, fallbackDate) => {
                const { data: blob, error: dlErr } = await supabase.storage
                    .from("clients")
                    .download(`${clientId}/${fileName}`);
                
                if (dlErr) return false;

                try {
                    const text = await blob.text();
                    const rawJson = JSON.parse(text);

                    // runAuditEngine() — same parser every live import path
                    // (ParseRreportModal.jsx, ClientHeader.jsx "Update Report",
                    // RawReportDebugger.jsx) uses, so a regenerated snapshot
                    // renders identically to a normally-imported one instead
                    // of the stripped-down shape the old analyzeRawReport()
                    // produced (no personal info, unflattened inquiries, no
                    // date/balance on negatives — the "got nothing" bug).
                    const analyzedReport = runAuditEngine(rawJson);
                    if (!analyzedReport) return false;

                    // 🕵️‍♂️ SMARTER DATE EXTRACTION
                    // Deliberately NOT trusting analyzedReport.meta.audit_date
                    // here — runAuditEngine() always stamps that as "right
                    // now" (it's not extracted from the report content), so
                    // both the baseline and current snapshot would collapse
                    // onto today's date and overwrite each other. Digging
                    // into the raw JSON for a real reported date (or falling
                    // back to the caller-provided fallbackDate) is what
                    // actually keeps the two snapshots distinguishable.
                    let reportDate = fallbackDate;

                    try {
                        if (rawJson.BundleComponents?.BundleComponent) {
                            const components = Array.isArray(rawJson.BundleComponents.BundleComponent) 
                                ? rawJson.BundleComponents.BundleComponent 
                                : [rawJson.BundleComponents.BundleComponent];

                            for (const comp of components) {
                                // Dig into TrueLink Sources
                                if (comp.TrueLinkCreditReportType?.Sources?.Source) {
                                    const sources = Array.isArray(comp.TrueLinkCreditReportType.Sources.Source)
                                        ? comp.TrueLinkCreditReportType.Sources.Source
                                        : [comp.TrueLinkCreditReportType.Sources.Source];
                                    
                                    if (sources[0]?.InquiryDate) {
                                        reportDate = sources[0].InquiryDate;
                                        break; // Stop searching once we find a date!
                                    }
                                }
                            }
                        }
                    } catch (dateErr) {
                        console.warn("Date extraction failed, using fallback.", dateErr);
                    }

                    console.log(`Saving ${fileName} snapshot as Date: ${reportDate}`);

                    const snapshotPath = `${clientId}/${reportDate}_summary_report.json`;
                    await supabase.storage
                        .from("clients")
                        .upload(snapshotPath, JSON.stringify(analyzedReport), { upsert: true });
                    
                    return true;
                } catch (e) {
                    console.warn(`Failed to process ${fileName}`, e);
                    return false;
                }
            };

            const hasRaw = fileList.find(f => f.name === 'raw_credit_report.json');
            if (hasRaw) {
                console.log("Processing Initial Baseline...");
                // Note: The fallback is still 2020-01-01, but the smarter logic should find the real date now!
                const success = await processAndSaveSnapshot('raw_credit_report.json', '2020-01-01');
                if (success) processedCount++;
            }

            const hasCurrent = fileList.find(f => f.name === 'credit_analysis.json');
            if (hasCurrent) {
                console.log("Processing Current Snapshot...");
                const today = new Date().toISOString().split('T')[0];
                const success = await processAndSaveSnapshot('credit_analysis.json', today);
                if (success) processedCount++;
            }

            if (processedCount === 1 && hasRaw) {
                console.log("Only 1 report found. Duplicating as Current so Progress UI works.");
                const today = new Date().toISOString().split('T')[0];
                await processAndSaveSnapshot('raw_credit_report.json', today);
                processedCount++;
            }

            if (processedCount === 0) {
                addToast({ title: "Nothing to Process", message: "No raw reports found to process.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
            } else {
                addToast({ title: "Success", message: "Regenerated snapshots for the Progress Report.", variant: "success", icon: "bi-check-circle-fill" });
                if (onComplete) onComplete();
            }

        } catch (err) {
            console.error(err);
            addToast({ title: "Error", message: "Error: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button 
            variant="secondary" 
            size="sm" 
            onClick={handleRegenerate} 
            disabled={loading}
            className="shadow-sm fw-bold"
        >
            {loading ? <Spinner as="span" animation="border" size="sm" className="me-2" /> : <i className="bi bi-magic me-2"></i>}
            Regenerate History
        </Button>
    );
}
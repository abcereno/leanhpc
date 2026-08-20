// src/utils/reportStorage.js
import { supabase } from "../supabaseClient";
import { detectProfileChanges } from "./creditAnalysis";

const BUCKET = "clients";
const DELTA_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/423af280-1504-4014-9f5e-f10b9bbc0985"; 

// --- NOTIFICATION CONTENT DICTIONARY ---
const NOTIFICATION_CONTENT = {
    positive_score_movement: { title: "Positive Score Movement", message: "An increase in score movement has recently been detected and may indicate improvements within your overall credit profile." },
    late_payment: { title: "Late Payment Activity", message: "A newly reported late payment appears to have impacted your score movement and overall profile stability." },
    new_inquiry: { title: "New Inquiry Detected", message: "A new hard inquiry has recently been reported and may temporarily impact score movement." },
    new_account: { title: "New Account Activity", message: "A newly opened account has recently been detected and may temporarily impact score movement." },
    utilization_increase: { title: "Credit Utilization Increase", message: "An increase in credit utilization has recently been detected and may temporarily impact your profile." },
    new_collection: { title: "Collection Activity Detected", message: "A new collection account has recently been reported and may impact score movement." },
    new_charge_off: { title: "Charge-Off Activity Detected", message: "A charge-off account update has recently been detected and may impact your score." },
    account_closure: { title: "Account Closure Detected", message: "An account closure has recently been detected and may temporarily impact score movement." },
    balance_increase: { title: "Balance Increase Detected", message: "An increase in reported balances has recently been detected and may impact your scores." },
    fraud_alert: { title: "Fraud Alert Detected", message: "A fraud alert has recently been detected on your credit profile." },
    limit_decrease: { title: "Credit Limit Decrease", message: "A reduction in available credit limits has recently been detected." },
    high_utilization_warning: { title: "High Utilization Warning", message: "High revolving utilization has recently been detected and may impact score movement." },
    new_bankruptcy: { title: "Bankruptcy Activity Detected", message: "Bankruptcy-related reporting activity has recently been detected." },
    reinserted_account: { title: "Account Reappeared", message: "A previously removed account has reappeared on your credit report." }
};

// --- 1. THE "SAFE UPDATE" FUNCTION ---
export async function saveUpdateAudit(clientId, rawJson, auditReport) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dateKey = new Date().toISOString().split('T')[0]; 

    // 👇 DELTA ANALYSIS ENGINE INTERCEPT 👇
    try {
        const auditPath = `${clientId}/client_audit_report.json`;
        const { data: oldAuditBlob } = await supabase.storage.from(BUCKET).download(auditPath);
        
        if (oldAuditBlob) {
            const oldAuditData = JSON.parse(await oldAuditBlob.text());
            const detectedEvents = detectProfileChanges(oldAuditData, auditReport);
            
            if (detectedEvents.length > 0) {
                console.log(`🔍 Delta Engine found ${detectedEvents.length} changes!`);
                
                // 1. SAVE TO DATABASE FOR CLIENT PORTAL
                const notificationsToInsert = detectedEvents.map(event => ({
                    client_id: clientId,
                    type: event,
                    title: NOTIFICATION_CONTENT[event]?.title || "Profile Update",
                    message: NOTIFICATION_CONTENT[event]?.message || "We detected a change on your credit profile."
                }));
                
                const { error: dbError } = await supabase.from('client_notifications').insert(notificationsToInsert);
                if (dbError) console.error("Error saving notifications to DB:", dbError);

                // 2. FIRE WEBHOOK FOR EMAILS
                const { data: clientData } = await supabase.from('clients').select('full_name, email, phone').eq('id', clientId).single();
                
                await fetch(DELTA_WEBHOOK_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        client_id: clientId,
                        client_name: clientData?.full_name || "Client",
                        client_email: clientData?.email || "",
                        client_phone: clientData?.phone || "",
                        detected_events: detectedEvents, 
                        timestamp: new Date().toISOString()
                    })
                }).catch(err => console.error("Webhook failed to send:", err));
            }
        }
    } catch (e) {
        console.warn("⚠️ Delta Analysis Engine skipped. (Usually happens on first import).", e);
    }
    // 👆 END DELTA ANALYSIS ENGINE 👆


    // 1. Archive Raw File (Keep history)
    const rawPath = `${clientId}/reports/raw/${timestamp}_smartcredit_raw.json`;
    await supabase.storage.from(BUCKET).upload(rawPath, JSON.stringify(rawJson));

    // 1b. Refresh the CANONICAL raw report (fixed path, always the latest
    // pull) — this used to only get written once, by saveInitialAudit, on
    // the very first import. Every subsequent "Update Report" refreshed
    // client_audit_report.json and the daily snapshot below but left this
    // file frozen at day one, so anything reading raw_credit_report.json
    // directly (useReportData.js / the Credit Report display) silently
    // showed stale data forever after the first update. This is now the
    // single source of truth every update keeps current — see
    // saveInitialAudit below, which no longer needs its own copy of this
    // write.
    const rawReportPath = `${clientId}/raw_credit_report.json`;
    await supabase.storage.from(BUCKET).upload(rawReportPath, JSON.stringify(rawJson), { upsert: true });

    // 2. Update Active Report (What the dashboard sees)
    const auditPath = `${clientId}/client_audit_report.json`;
    await supabase.storage.from(BUCKET).upload(auditPath, JSON.stringify(auditReport), { upsert: true });

    // 3. Update Daily Snapshot (For Progress Graph)
    const snapshotPath = `${clientId}/${dateKey}_summary_report.json`;
    await supabase.storage.from(BUCKET).upload(snapshotPath, JSON.stringify(auditReport), { upsert: true });

    // 4. Update Score History Log
    await updateScoreHistory(clientId, auditReport.scores, dateKey);

    // 5. Stamp "last report update" — the real source of truth for Case
    // Management's Production Queue countdown (utils/aging.js's
    // getCaseManagementCountdown), which used to only have paid_at to go
    // on. Defensive: sql/add_last_report_update.sql may not have been run
    // yet on every environment — warn and move on rather than throwing, so
    // a missing optional column never blocks the report update itself.
    const { error: tsError } = await supabase
        .from("clients")
        .update({ last_report_update_at: new Date().toISOString() })
        .eq("id", clientId);
    if (tsError && /last_report_update_at/i.test(tsError.message || "")) {
        console.warn("clients.last_report_update_at not found (run sql/add_last_report_update.sql) — skipping.");
    } else if (tsError) {
        console.warn("Failed to stamp last_report_update_at:", tsError.message);
    }

    return true;
}

// --- 2. THE "INITIAL IMPORT" FUNCTION ---
// saveUpdateAudit now writes raw_credit_report.json itself (see 1b above),
// so this is just a named entry point for "first import" callers — kept
// separate from saveUpdateAudit rather than merged so call sites stay
// self-documenting about which case they're in.
export async function saveInitialAudit(clientId, rawJson, auditReport) {
    return saveUpdateAudit(clientId, rawJson, auditReport);
}

// Helper for Score History 
async function updateScoreHistory(clientId, scores, dateKey) {
    const historyPath = `${clientId}/client_score_history.json`;
    let history = [];
    
    const { data } = await supabase.storage.from(BUCKET).download(historyPath);
    if (data) {
        try { history = JSON.parse(await data.text()); } catch(e) {console.log(e);}
    }

    const newEntry = {
        date: dateKey,
        scores: scores,
        imported_at: new Date().toISOString()
    };
    
    history = history.filter(h => h.date !== dateKey);
    history.push(newEntry);
    history.sort((a, b) => new Date(a.date) - new Date(b.date));

    await supabase.storage.from(BUCKET).upload(historyPath, JSON.stringify(history), { upsert: true });
}
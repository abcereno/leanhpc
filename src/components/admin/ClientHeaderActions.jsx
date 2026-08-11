// src/components/ClientHeaderActions.jsx
import { useState } from "react";
import {supabase} from "../../supabaseClient"

export default function ClientHeaderActions({ clientId }) {
  const [busy, setBusy] = useState(null);
  const [channel, setChannel] = useState("portal");
  const [filesValue, setFilesValue] = useState(""); // comma-separated file paths/ids

  async function clearStage(stage) {
    const map = {
      call: ["CALL_DUE_24H","CALL_OVERDUE_48H","CALL_DAILY_OVERDUE"],
      docs: ["DOCS_DUE_24H","DOCS_OVERDUE_48H","DOCS_DAILY_OVERDUE"],
      followup: ["FOLLOWUP_REMINDER_D6","FOLLOWUP_DUE_D7","FOLLOWUP_DAILY_OVERDUE"]
    };
    await supabase.from("alerts_log")
      .update({ cleared_at: new Date().toISOString() })
      .in("alert_type", map[stage])
      .eq("client_id", clientId)
      .is("cleared_at", null);
  }

  async function completeCall() {
    setBusy("call");
    await supabase.from("clients")
      .update({ call_completed_at: new Date().toISOString(), status_stage: "Docs Pending" })
      .eq("id", clientId);
    await clearStage("call");
    setBusy(null);
  }

  async function submitDocs() {
    setBusy("docs");
    const files = filesValue
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    await supabase.from("clients")
      .update({
        tu_eq_docs_submitted_at: new Date().toISOString(),
        tu_eq_docs_channel: channel,
        tu_eq_doc_files: files,
        status_stage: "Docs Submitted"
      })
      .eq("id", clientId);
    await clearStage("docs");
    setBusy(null);
  }

  async function logFollowup() {
    setBusy("followup");
    await supabase.from("clients")
      .update({ tu_eq_followup_completed_at: new Date().toISOString(), status_stage: "Completed" })
      .eq("id", clientId);
    await clearStage("followup");
    setBusy(null);
  }

  return (
    <div className="d-flex flex-wrap gap-2">
      <button disabled={!!busy} onClick={completeCall} className="btn btn-dark">
        Complete Experian Call
      </button>

      <div className="input-group" style={{ maxWidth: 520 }}>
        <label className="input-group-text" htmlFor="docs-channel">Channel</label>
        <select id="docs-channel" className="form-select" value={channel} onChange={e=>setChannel(e.target.value)}>
          <option value="email">email</option>
          <option value="fax">fax</option>
          <option value="portal">portal</option>
          <option value="manual">manual</option>
        </select>
        <input
          type="text"
          className="form-control"
          placeholder="file ids/paths (comma separated)"
          value={filesValue}
          onChange={e=>setFilesValue(e.target.value)}
        />
        <button disabled={!!busy} className="btn btn-primary" onClick={submitDocs}>
          Submit TU/EQ Docs
        </button>
      </div>

      <button disabled={!!busy} onClick={logFollowup} className="btn btn-success">
        Log TU/EQ Follow-up
      </button>
    </div>
  );
}

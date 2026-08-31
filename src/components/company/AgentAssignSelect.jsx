// src/components/company/AgentAssignSelect.jsx
//
// Lets a company admin (re)assign which of their agents a client belongs
// to, directly from a client list row. Writes clients.agent_id and also
// clears the older denormalized clients.agent text column — agentDisplay.js's
// resolveAgentName() (and the ad hoc equivalents still inline in
// ServiceClientList.jsx / InquiryRemovalClientList.jsx) all prefer that
// text column over agent_id when both are present, so leaving stale text
// behind would make a reassignment silently not show up anywhere that
// reads it.
import { useState } from "react";
import { Form, Spinner } from "react-bootstrap";
import { supabase } from "../../supabaseClient";

export default function AgentAssignSelect({ clientId, agentId, agents, onAssigned, disabled }) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (e) => {
    const newAgentId = e.target.value || null;
    if (newAgentId === (agentId || null)) return;

    setSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({ agent_id: newAgentId, agent: null })
      .eq("id", clientId);
    setSaving(false);

    if (error) {
      console.error("Failed to reassign agent:", error.message);
      alert(`Couldn't reassign agent: ${error.message}`);
      return;
    }
    onAssigned?.(clientId, newAgentId);
  };

  return (
    <Form.Select
      size="sm"
      value={agentId || ""}
      onChange={handleChange}
      disabled={disabled || saving}
      style={{ minWidth: 160 }}
      onClick={(e) => e.stopPropagation()}
    >
      <option value="">Unassigned</option>
      {agents.map((a) => (
        <option key={a.id} value={a.id}>{a.full_name}</option>
      ))}
    </Form.Select>
  );
}

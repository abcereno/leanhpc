// /hooks/useMessageLogger.js
import { useCallback } from "react";
import { supabase } from "@/lib/supabaseClient"; // adjust path

export function useMessageLogger(
  table = "call_logs",
  column = "exp_result" // change to "tu_result" or "eq_result" as needed
) {
  const logMessage = useCallback(async ({ message, clientId = null, employeeId = null, extra = {} }) => {
    if (!message || !message.trim()) return null;

    const payload = {
      client_id: clientId,
      employee_id: employeeId,
      [column]: message,
      created_at: new Date().toISOString(), // fits timestamptz
      ...extra, // e.g. { call_date: '2025-09-25', exp_start_time: '10:04 PM' }
    };

    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error) {
      console.error("[useMessageLogger] insert error:", error);
      throw error;
    }
    return data;
  }, [table, column]);

  return logMessage;
}

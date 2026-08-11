// utils/attendance.js
import { getESTDate } from "./time";
import { supabase } from "../supabaseClient";

/** Ensures a row for today; returns { row, created } */
async function upsertTodayRow(employeeId) {
  const { dateStr: today } = getESTDate();
  // Try fetch
  const { data, error } = await supabase
    .from("employee_logs")
    .select("id, login_times, logout_times, breaks")
    .eq("employee_id", employeeId)
    .eq("log_date", today)
    .single();

  if (!error && data) return { row: data, created: false };
  if (error && error.code !== "PGRST116") throw error; // real error

  // Create if missing
  const { data: inserted, error: insErr } = await supabase
    .from("employee_logs")
    .insert([{ employee_id: employeeId, log_date: today, login_times: [], logout_times: [], breaks: [] }])
    .select("id, login_times, logout_times, breaks")
    .single();

  if (insErr) throw insErr;
  return { row: inserted, created: true };
}

export async function appendLoginTime(employeeId) {
  const { timeStr } = getESTDate();
  const { row } = await upsertTodayRow(employeeId);
  const login_times = Array.isArray(row.login_times) ? row.login_times : [];
  const { error } = await supabase
    .from("employee_logs")
    .update({ login_times: [...login_times, timeStr] })
    .eq("id", row.id);
  if (error) throw error;
}

export async function appendLogoutTime(employeeId) {
  const { timeStr } = getESTDate();
  const { row } = await upsertTodayRow(employeeId);
  const logout_times = Array.isArray(row.logout_times) ? row.logout_times : [];
  const { error } = await supabase
    .from("employee_logs")
    .update({ logout_times: [...logout_times, timeStr] })
    .eq("id", row.id);
  if (error) throw error;
}

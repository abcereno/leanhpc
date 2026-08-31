import { supabase } from "../supabaseClient";

// "YYYY-MM-DD" -> "MM/DD/YYYY" for display. Passes through anything else
// (null, already-odd-shaped strings) unchanged rather than throwing — used
// wherever a raw AI-extracted date (expiresAt/issuedAt from
// supabase/functions/validate-document) gets shown to an admin, e.g.
// CoverLetterAssets.jsx and AlignmentCheckPanel.jsx's "AI detected" lines.
export function formatYmd(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || null;
  const [y, m, d] = ymd.split("-");
  return `${m}/${d}/${y}`;
}

let cachedHolidays = null;

export async function getHolidays() {
  if (cachedHolidays) return cachedHolidays;
  
  const { data } = await supabase.from("company_holidays").select("date");
  cachedHolidays = new Set(data?.map(h => h.date) || []);
  return cachedHolidays;
}

/**
 * Business days a paid client has been in production, freezing while
 * currently paused instead of continuing to accrue — see
 * utils/clientsData.js#enrichClientRows and useAdminClients.js#enrichRows,
 * the two fleet-wide row-enrichment functions this replaces the inline
 * `calculateBusinessDays(r.paid_at, paidEnd, holidays)` call in. Neither
 * ever looked at is_paused/paused_at/paused_days_total, so a paused
 * client's day count kept climbing exactly like an active file — it could
 * drift into the "20-29 Days" or "30+ Days" Production Queue bucket
 * looking identical to a genuinely stalled file, with nothing on the
 * board itself distinguishing the two until someone opened the profile
 * and noticed the PAUSED badge.
 *
 * `r` needs `paid_at`, `date_completed`, `is_paused`, `paused_at`, and
 * `paused_days_total` (all already selected everywhere paidRunningDays is
 * computed). `now` is injectable for callers that already computed one
 * shared "now" for the whole batch.
 *
 * paused_days_total is stored in raw calendar days (see
 * useClientActions.js#togglePause / useAdminClients.js's own pause
 * handler), so subtracting it from a business-day count is an
 * approximation for a client paused and resumed multiple times in the
 * past — only exact for the *current* pause, which freezes the end date
 * at paused_at exactly.
 */
export function calculatePaidRunningDays(r, holidaySet, now = new Date()) {
  if (!r?.paid_at) return 0;
  const fallbackEnd = r.date_completed ? new Date(r.date_completed) : now;
  const effectiveEnd = r.is_paused && r.paused_at ? new Date(r.paused_at) : fallbackEnd;
  const raw = calculateBusinessDays(r.paid_at, effectiveEnd, holidaySet);
  return Math.max(0, raw - (r.paused_days_total || 0));
}

export function calculateBusinessDays(startDate, endDate, holidaySet) {
  if (!startDate || !endDate) return 0;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  start.setHours(0,0,0,0);
  end.setHours(0,0,0,0);

  if (start > end) return 0;

  let count = 0;
  let curDate = new Date(start);

  while (curDate <= end) {
    const dayOfWeek = curDate.getDay();
    
    // FIX: Use local YYYY-MM-DD format to match database strings exactly
    // (toISOString() shifts to UTC, which breaks holidays in some timezones)
    const year = curDate.getFullYear();
    const month = String(curDate.getMonth() + 1).padStart(2, '0');
    const day = String(curDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // 0=Sun, 6=Sat
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateStr)) {
      count++;
    }

    curDate.setDate(curDate.getDate() + 1);
  }

  return count > 0 ? count + 1 : 0;
}
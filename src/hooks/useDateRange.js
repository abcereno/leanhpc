// src/hooks/useDateRange.js
//
// Shared {from, to} date-range state (YYYY-MM-DD strings, inclusive on both
// ends) for the Ops Dashboard.
//
// Two starting points, chosen per call site:
// - "thisMonth" (default): start of this month -> today. Used by Company
//   Snapshot / Daily Metrics so those sections look the same on first load
//   as they did before this control existed (they were always a
//   this-week/this-month window) — widening/narrowing is opt-in from there.
// - "empty": no bound on either side (all-time). Used by Production Queue —
//   it's a backlog/queue view, and defaulting it to "this month" silently
//   hides everything created earlier AND conflicts with the aging-bucket
//   chips (a client can't be both "created this month" and "aged 15+
//   business days" — see utils/clientFlags.js's over_15/20/30 predicates),
//   which made the date filter look broken rather than just unnecessary by
//   default.
//
// Deliberately separate from AdminDashboard.jsx's own local `dateRange`
// state for the (pre-existing, independent) Call Metrics tab — that one
// queries a different table (call_metrics) and shouldn't be coupled to this.

import { useCallback, useState } from "react";

function startOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Local YYYY-MM-DD (matches the en-CA convention already used elsewhere in
// this codebase, e.g. hooks/useDailyMetrics.js, to avoid UTC-shift bugs).
function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

export default function useDateRange({ defaultRange = "thisMonth" } = {}) {
  const [from, setFrom] = useState(defaultRange === "empty" ? "" : startOfMonthStr());
  const [to, setTo] = useState(defaultRange === "empty" ? "" : todayStr());

  // Clears both bounds — an empty from/to means "no lower/upper bound",
  // i.e. all-time.
  const clear = useCallback(() => {
    setFrom("");
    setTo("");
  }, []);

  const reset = useCallback(() => {
    if (defaultRange === "empty") {
      setFrom("");
      setTo("");
    } else {
      setFrom(startOfMonthStr());
      setTo(todayStr());
    }
  }, [defaultRange]);

  // Accepts any ISO-ish date or timestamp string (date-only "YYYY-MM-DD" or
  // a full timestamptz) and checks whether its date portion falls within
  // [from, to]. An unset from/to on either side is treated as unbounded.
  const inRange = useCallback(
    (isoString) => {
      if (!isoString) return false;
      const d = String(isoString).slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    },
    [from, to]
  );

  const isActive = Boolean(from || to);

  return { from, to, setFrom, setTo, clear, reset, inRange, isActive };
}

// Single "human readable elapsed time" formatter — e.g. "45 mins" or
// "2 hr 5 min". Previously duplicated as a local formatTimeTaken() inside
// useInquiriesThread.js; pulled out so anywhere else that needs to show an
// elapsed/processing duration (e.g. ClientSubmissionListener.jsx's fallback
// for clients whose processing_duration was never recorded) uses the exact
// same format instead of inventing a second one.

export function formatDurationMs(ms) {
  if (!ms || ms < 0) return "0 mins";
  const diffMins = Math.floor(ms / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  if (diffHrs > 0) return `${diffHrs} hr ${mins} min`;
  return `${mins} min${mins !== 1 ? "s" : ""}`;
}

export function formatDurationBetween(startMs, endMs = Date.now()) {
  if (!startMs) return "0 mins";
  return formatDurationMs(endMs - startMs);
}

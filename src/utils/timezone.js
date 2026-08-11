/**
 * Returns the current date in EST/EDT as YYYY-MM-DD string.
 */
export function getEasternDateString() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date()); // Returns YYYY-MM-DD format in EST
}


/**
 * Returns the current timestamp as an ISO string (in EST time).
 * Safe for database logging.
 */
export function getEasternTimestamp() {
  const estNow = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(estNow);
  const getPart = (type) => parts.find(p => p.type === type)?.value.padStart(2, "0");

  const estISO = `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")}.000Z`;

  return estISO;
}

export function getESTDate() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find(p => p.type === type)?.value;

  const yyyy = get("year");
  const mm = get("month").padStart(2, "0");
  const dd = get("day").padStart(2, "0");
  const hh = get("hour").padStart(2, "0");
  const min = get("minute").padStart(2, "0");
  const sec = get("second").padStart(2, "0");

  return {
    dateStr: `${yyyy}-${mm}-${dd}`, // EST date (correct log_date)
    timeStr: `${hh}:${min}:${sec}`, // EST time (correct login/logout/break)
  };
}

/**
 * Converts a UTC ISO timestamp into an EST/EDT localized string.
 */
export function formatToEasternLocaleString(utcString) {
  const date = new Date(utcString);

  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Just returns the date portion in EST/EDT (YYYY-MM-DD format)
 */
export function formatToEasternDateOnly(utcString) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date(utcString)); // en-CA = YYYY-MM-DD
}

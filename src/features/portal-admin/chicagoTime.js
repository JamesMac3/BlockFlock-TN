// Meeting timestamps are always stored as real UTC instants (timestamptz)
// but every meeting's wall-clock time is fixed to America/Chicago. Browsers
// have no native "give me this instant in a specific IANA zone as a plain
// wall-clock string" primitive that also converts the other direction, so
// these helpers do both conversions explicitly rather than trusting the
// visitor's own local timezone (which is frequently not America/Chicago).

const CHICAGO_TZ = "America/Chicago";

function chicagoOffsetMinutes(instant) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(instant).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - instant.getTime()) / 60000;
}

// Takes a "YYYY-MM-DDTHH:mm" value (as produced by <input type="datetime-local">)
// interpreted as America/Chicago wall-clock time, and returns the matching
// UTC ISO instant to send to a timestamptz RPC parameter.
export function chicagoWallTimeToUtcIso(localDateTimeValue) {
  if (!localDateTimeValue) return null;
  const guess = new Date(`${localDateTimeValue}:00.000Z`);
  const offsetMinutes = chicagoOffsetMinutes(guess);
  return new Date(guess.getTime() - offsetMinutes * 60000).toISOString();
}

// The reverse: formats a UTC instant (ISO string or Date) as the
// "YYYY-MM-DDTHH:mm" value a datetime-local input expects, in America/Chicago.
export function toChicagoDateTimeLocalValue(isoOrDate) {
  if (!isoOrDate) return "";
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
}

// A friendly display string, e.g. "Sep 1, 2026, 5:00 PM CT".
export function formatChicagoDateTime(isoOrDate) {
  if (!isoOrDate) return "";
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
  return `${formatted} CT`;
}

// The date-only half of formatChicagoDateTime, e.g. "Sep 1, 2026" — for
// copy that reads "Requested [date] at [time]" as two separate pieces.
export function formatChicagoDate(isoOrDate) {
  if (!isoOrDate) return "";
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("en-US", { timeZone: CHICAGO_TZ, dateStyle: "medium" }).format(date);
}

// The time-only half, e.g. "5:00 PM CT".
export function formatChicagoTime(isoOrDate) {
  if (!isoOrDate) return "";
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const formatted = new Intl.DateTimeFormat("en-US", { timeZone: CHICAGO_TZ, timeStyle: "short" }).format(date);
  return `${formatted} CT`;
}

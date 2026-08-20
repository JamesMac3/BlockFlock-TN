/**
 * Deliberate MM/DD/YYYY -> ISO (YYYY-MM-DD) conversion for stored goal
 * payload dates. Does not use `new Date(string)` parsing, which accepts
 * malformed and ambiguous input inconsistently across browsers; every
 * component is validated by hand, including calendar-correct day-of-month
 * bounds and leap years.
 */

const MM_DD_YYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export class InvalidStoredDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStoredDateError";
  }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function normalizeMmDdYyyyToIsoDate(value: string): string {
  const match = MM_DD_YYYY.exec(value.trim());
  if (!match) {
    throw new InvalidStoredDateError(`Stored date "${value}" is not in MM/DD/YYYY format.`);
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12) {
    throw new InvalidStoredDateError(`Stored date "${value}" has an invalid month.`);
  }

  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > maxDay) {
    throw new InvalidStoredDateError(`Stored date "${value}" has an invalid day for its month.`);
  }

  if (year < 1000 || year > 9999) {
    throw new InvalidStoredDateError(`Stored date "${value}" has an invalid year.`);
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

import { describe, expect, it } from "vitest";
import { InvalidStoredDateError, normalizeMmDdYyyyToIsoDate } from "./date-normalization";

describe("normalizeMmDdYyyyToIsoDate", () => {
  it("converts a valid MM/DD/YYYY date to ISO", () => {
    expect(normalizeMmDdYyyyToIsoDate("01/05/2026")).toBe("2026-01-05");
    expect(normalizeMmDdYyyyToIsoDate("12/31/2025")).toBe("2025-12-31");
  });

  it("accepts February 29 on a leap year", () => {
    expect(normalizeMmDdYyyyToIsoDate("02/29/2028")).toBe("2028-02-29");
  });

  it("rejects February 29 on a non-leap year", () => {
    expect(() => normalizeMmDdYyyyToIsoDate("02/29/2026")).toThrow(InvalidStoredDateError);
  });

  it("rejects a century year that is not a leap year (2100)", () => {
    expect(() => normalizeMmDdYyyyToIsoDate("02/29/2100")).toThrow(InvalidStoredDateError);
  });

  it("rejects an out-of-range month", () => {
    expect(() => normalizeMmDdYyyyToIsoDate("13/01/2026")).toThrow(InvalidStoredDateError);
    expect(() => normalizeMmDdYyyyToIsoDate("00/01/2026")).toThrow(InvalidStoredDateError);
  });

  it("rejects a day that does not exist in its month", () => {
    expect(() => normalizeMmDdYyyyToIsoDate("04/31/2026")).toThrow(InvalidStoredDateError);
  });

  it("rejects non MM/DD/YYYY formats without loose Date parsing", () => {
    expect(() => normalizeMmDdYyyyToIsoDate("2026-01-05")).toThrow(InvalidStoredDateError);
    expect(() => normalizeMmDdYyyyToIsoDate("1/5/2026")).toThrow(InvalidStoredDateError);
    expect(() => normalizeMmDdYyyyToIsoDate("not a date")).toThrow(InvalidStoredDateError);
    expect(() => normalizeMmDdYyyyToIsoDate("")).toThrow(InvalidStoredDateError);
  });
});

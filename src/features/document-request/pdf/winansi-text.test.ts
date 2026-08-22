import { describe, expect, it } from "vitest";
import { sanitizeForWinAnsiFont } from "./winansi-text";

describe("sanitizeForWinAnsiFont: never lets an unencodable character crash pdf-lib's standard font", () => {
  it("reproduces the exact reported failure: a rightwards arrow degrades to '->' instead of crashing", () => {
    expect(sanitizeForWinAnsiFont("records located → transferred")).toBe("records located -> transferred");
  });

  it("plain ASCII passes through completely unchanged", () => {
    const text = "All contracts, purchase orders, and invoices for Flock Safety.";
    expect(sanitizeForWinAnsiFont(text)).toBe(text);
  });

  it("Latin-1 accented characters (already WinAnsi-safe) pass through unchanged", () => {
    expect(sanitizeForWinAnsiFont("café, naïve, façade")).toBe("café, naïve, façade");
  });

  it("CP1252's own special punctuation (em dash, curly quotes, ellipsis, bullet) passes through unchanged — it does not need substitution", () => {
    const text = "He said “wait” — then … • done";
    expect(sanitizeForWinAnsiFont(text)).toBe(text);
  });

  it("every arrow variant maps to a readable ASCII equivalent", () => {
    expect(sanitizeForWinAnsiFont("→")).toBe("->");
    expect(sanitizeForWinAnsiFont("←")).toBe("<-");
    expect(sanitizeForWinAnsiFont("⇒")).toBe("=>");
    expect(sanitizeForWinAnsiFont("⇐")).toBe("<=");
    expect(sanitizeForWinAnsiFont("↑")).toBe("^");
    expect(sanitizeForWinAnsiFont("↓")).toBe("v");
    expect(sanitizeForWinAnsiFont("↔")).toBe("<->");
  });

  it("a non-breaking space becomes a normal space, and a zero-width space disappears", () => {
    expect(sanitizeForWinAnsiFont("a b")).toBe("a b");
    expect(sanitizeForWinAnsiFont("a​b")).toBe("ab");
  });

  it("accented letters outside Latin-1 (e.g. Vietnamese, Central European) degrade to their base letter rather than vanishing", () => {
    expect(sanitizeForWinAnsiFont("Nguyễn")).toBe("Nguyen");
  });

  it("emoji and other symbols entirely outside WinAnsi are dropped, not left in to crash generation", () => {
    expect(sanitizeForWinAnsiFont("Great! 🎉🔥")).toBe("Great! ");
  });

  it("CJK text is dropped rather than crashing — a documented limitation of the standard-font fallback, not a silent corruption of Latin text", () => {
    expect(sanitizeForWinAnsiFont("Hello 你好 world")).toBe("Hello  world");
  });

  it("empty and falsy input pass through unchanged", () => {
    expect(sanitizeForWinAnsiFont("")).toBe("");
  });
});

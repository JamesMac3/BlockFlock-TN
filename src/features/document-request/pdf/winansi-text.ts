/**
 * Neither the acroform nor the overlay renderer ever supplies a custom
 * embedded font today (no `loadFont` dependency is wired into
 * generate-request-document.ts or generate-operator-preview-document.ts),
 * so every rendered PDF falls back to pdf-lib's built-in standard font
 * (Helvetica), which can only encode WinAnsi (Windows-1252). An operator
 * or a member of the public typing an arrow, an emoji, or a character
 * from a non-Latin script into a records-description field previously
 * crashed PDF generation entirely with an unhandled pdf-lib encoding
 * exception — the whole document failed to produce rather than degrading
 * gracefully. This sanitizes any value headed for a rendered (not PDF
 * metadata) text field so generation can never fail on encoding alone.
 *
 * Every non-ASCII character referenced here is built from an explicit
 * \u escape or String.fromCodePoint — never a literal glyph pasted into
 * this source file — so every substitution is unambiguous on review.
 *
 * If a real embedded Unicode font is wired in later, this sanitization
 * step should be made conditional on whether a custom font was actually
 * loaded — WinAnsi's limits do not apply once a broader-coverage font is
 * in use.
 */

// The CP1252 (WinAnsi) 0x80-0x9F byte range remaps to these specific
// Unicode code points — e.g. an em dash (U+2014) or a curly quote
// (U+2018) is natively representable even though its raw code point is
// far outside the 0x00-0xFF byte range. Everything else above 0xFF
// (arrows, most symbols, emoji, CJK, etc.) is not.
const WINANSI_HIGH_CODEPOINTS = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function isWinAnsiEncodable(codePoint: number): boolean {
  if (codePoint <= 0x7f) return true; // ASCII
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true; // Latin-1 supplement
  return WINANSI_HIGH_CODEPOINTS.has(codePoint);
}

// Common characters people actually type (arrows especially) that have an
// obvious, readable ASCII substitute — corrected before the general
// strip-pass below, so an arrow degrades to "->" instead of vanishing.
const READABLE_SUBSTITUTIONS: ReadonlyArray<readonly [number, string]> = [
  [0x2192, "->"], // RIGHTWARDS ARROW
  [0x2190, "<-"], // LEFTWARDS ARROW
  [0x21d2, "=>"], // RIGHTWARDS DOUBLE ARROW
  [0x21d0, "<="], // LEFTWARDS DOUBLE ARROW
  [0x2191, "^"], // UPWARDS ARROW
  [0x2193, "v"], // DOWNWARDS ARROW
  [0x2194, "<->"], // LEFT RIGHT ARROW
  [0x00a0, " "], // NO-BREAK SPACE
  [0x200b, ""], // ZERO WIDTH SPACE
];

const COMBINING_MARKS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Returns a version of `value` that pdf-lib's standard WinAnsi-encoded
 * font can always render: known arrow/space characters are replaced with
 * a readable ASCII equivalent first; every remaining character is then
 * checked individually — one already WinAnsi-encodable (including every
 * Latin-1 accented letter and every CP1252 special like an em dash or an
 * ellipsis) is left completely untouched, and only a character that is
 * NOT directly encodable falls back to NFKD decomposition with its
 * combining marks stripped (e.g. an accented letter outside Latin-1
 * degrades to its plain base letter). Checking per-character rather than
 * NFKD-normalizing the whole string up front matters: NFKD's compatibility
 * decomposition would otherwise mangle characters that never needed any
 * correction at all (e.g. an ellipsis "…" — already WinAnsi-safe — decomposes
 * to three separate periods under NFKD, and a precomposed "é" — also already
 * safe — decomposes into "e" + a combining mark that would then be stripped).
 */
export function sanitizeForWinAnsiFont(value: string): string {
  if (!value) return value;

  let result = value;
  for (const [codePoint, replacement] of READABLE_SUBSTITUTIONS) {
    result = result.split(String.fromCodePoint(codePoint)).join(replacement);
  }

  return Array.from(result)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      if (isWinAnsiEncodable(codePoint)) return character;
      const decomposed = character.normalize("NFKD").replace(COMBINING_MARKS_PATTERN, "");
      return Array.from(decomposed)
        .filter((decomposedChar) => isWinAnsiEncodable(decomposedChar.codePointAt(0) ?? 0))
        .join("");
    })
    .join("");
}

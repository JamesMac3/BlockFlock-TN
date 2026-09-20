import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Vitest's default CSS handling empties plain .css imports (even with
// ?raw), so this reads the file directly rather than importing it.
const css = readFileSync(
  new URL("../../components/portal/ChapterAccountSettings.css", import.meta.url),
  "utf8"
);

describe("ChapterAccountSettings.css: opaque navy card, no reliance on ambient/inherited color", () => {
  it("the outer card itself is an explicit opaque navy surface with light text — not just the inner summary panel", () => {
    const cardBlock = css.match(/^\.chapter-account-settings \{[\s\S]*?\}/m)?.[0] ?? "";
    expect(cardBlock).toMatch(/background: var\(--surface, #0b1828\);/);
    expect(cardBlock).toMatch(/color: var\(--text, #f2efe7\);/);
  });

  it("headings, section descriptions, and labels all set an explicit light color, never left to inherit", () => {
    expect(css).toMatch(/\.chapter-account-settings h2 \{[\s\S]*?color: var\(--text, #f2efe7\);/);
    expect(css).toMatch(/\.chapter-account-settings h3 \{[\s\S]*?color: var\(--text, #f2efe7\);/);
    expect(css).toMatch(/\.chapter-account-settings__section > p \{[\s\S]*?color: var\(--text-muted, #b8b4aa\);/);
    expect(css).toMatch(/\.chapter-account-settings__section label \{\s*\n\s*color: var\(--text, #f2efe7\);/);
  });

  it("the password section is no longer the light #f9fafb panel it was — it matches the dark portal surface", () => {
    const passwordBlock = css.match(/\.chapter-account-settings__section--password \{[\s\S]*?\}/)?.[0] ?? "";
    expect(passwordBlock).not.toMatch(/#f9fafb/);
    expect(passwordBlock).toMatch(/background: var\(--surface-muted, #102236\);/);
  });
});

describe("ChapterAccountSettings.css: light inputs, dark entered text, visible borders and focus", () => {
  it("inputs use the same light-cream/dark-text pattern as PortalLogin.css's own inputs", () => {
    const inputBlock = css.match(/^\.chapter-account-settings__section input \{[\s\S]*?\}/m)?.[0] ?? "";
    expect(inputBlock).toMatch(/background: #f2efe7;/);
    expect(inputBlock).toMatch(/color: #07111f;/);
    expect(inputBlock).toMatch(/border: 1px solid rgba\(242, 239, 231, 0\.35\);/);
  });

  it("forces autofilled inputs to keep the same light-cream/dark-text look instead of the browser's own yellow tint", () => {
    const autofillBlock = css.match(/\.chapter-account-settings__section input:-webkit-autofill[\s\S]*?\}/)?.[0] ?? "";
    expect(autofillBlock).toMatch(/-webkit-text-fill-color: #07111f;/);
    expect(autofillBlock).toMatch(/-webkit-box-shadow: 0 0 0 1000px #f2efe7 inset;/);
  });

  it("has a visible keyboard-focus indicator for both inputs and buttons", () => {
    expect(css).toMatch(/\.chapter-account-settings input:focus-visible,\s*\n\.chapter-account-settings button:focus-visible \{\s*\n\s*outline: 3px solid #55e1ff;/);
  });

  it("sizes inputs with box-sizing: border-box so padding/border never push the field past its container width", () => {
    const inputBlock = css.match(/^\.chapter-account-settings__section input \{[\s\S]*?\}/m)?.[0] ?? "";
    expect(inputBlock).toMatch(/width: 100%;/);
    expect(inputBlock).toMatch(/box-sizing: border-box;/);
  });
});

describe("ChapterAccountSettings.css: submit buttons are red-primary, ancestor-qualified to outrank the global .portal-dashboard button rule", () => {
  it("the submit-button selector is qualified with two ancestor classes, outranking .portal-dashboard button's one-class-one-type specificity", () => {
    expect(css).toMatch(/^\.chapter-account-settings \.chapter-account-settings__section button\[type="submit"\] \{/m);
  });

  it("the submit button is red, matching the site's other primary portal actions", () => {
    const submitBlock = css.match(/^\.chapter-account-settings \.chapter-account-settings__section button\[type="submit"\] \{[\s\S]*?\}/m)?.[0] ?? "";
    expect(submitBlock).toMatch(/background: #d82d2d;/);
    expect(submitBlock).toMatch(/color: #f2efe7;/);
    expect(submitBlock).toMatch(/border: 1px solid #d82d2d;/);
  });

  it("the sign-out button is also ancestor-qualified, so its intended transparent/outline look isn't overwritten by the global rule", () => {
    const signOutBlock = css.match(/^\.chapter-account-settings \.chapter-account-settings__sign-out \{[\s\S]*?\}/m)?.[0] ?? "";
    expect(signOutBlock).toBeTruthy();
    expect(signOutBlock).toMatch(/background: transparent;/);
  });

  it("disabled submit buttons stay legible (dimmed, not hidden) rather than vanishing", () => {
    const disabledBlock = css.match(/^\.chapter-account-settings \.chapter-account-settings__section button\[type="submit"\]:disabled \{[\s\S]*?\}/m)?.[0] ?? "";
    expect(disabledBlock).toMatch(/opacity: 0\.65;/);
  });
});

describe("ChapterAccountSettings.css: error/success messages readable on the dark surface", () => {
  it("error text uses a light-on-dark-friendly color, not the original dark-red-on-light color", () => {
    const errorBlock = css.match(/^\.chapter-account-settings__error \{[\s\S]*?\}/m)?.[0] ?? "";
    expect(errorBlock).not.toMatch(/#991b1b/);
    expect(errorBlock).toMatch(/color: #ffd8d8;/);
  });

  it("success text uses a light-on-dark-friendly color, not the original dark-green-on-light color", () => {
    const successBlock = css.match(/^\.chapter-account-settings__success \{[\s\S]*?\}/m)?.[0] ?? "";
    expect(successBlock).not.toMatch(/#166534/);
    expect(successBlock).toMatch(/color: #55e1ff;/);
  });
});

describe("ChapterAccountSettings.css: responsive without horizontal overflow", () => {
  it("has a mobile breakpoint that keeps the card within the viewport and stretches the submit button for touch", () => {
    const mobileBlock = css.match(/@media \(max-width: 480px\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(mobileBlock).toMatch(/max-width: 100%;/);
    expect(mobileBlock).toMatch(/width: 100%;/);
  });
});

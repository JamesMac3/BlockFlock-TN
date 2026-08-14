import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  PRIVACY_TICKER_HIDE_AT,
  PRIVACY_TICKER_SHOW_AT,
  shouldCollapsePrivacyTicker,
} from "../src/utils/privacyTickerState.js";

const component = readFileSync(new URL("../src/components/PrivacyTicker.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/components/PrivacyTicker.css", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/pages/Home/HomePage.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("old popup, delayed display, dismissal, and example IP are removed", () => {
  assert.equal(existsSync(new URL("../src/components/IpAwarenessCard.jsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/components/IpAwarenessCard.css", import.meta.url)), false);
  assert.doesNotMatch(home, /IpAwarenessCard|203\.0\.113\.42/);
  assert.doesNotMatch(component, /fetch\(|setTimeout|localStorage|sessionStorage|Dismiss/);
});

test("ticker is mounted only by the exact homepage route component", () => {
  assert.match(app, /<Route path="\/" element=\{<HomePage \/>\}/);
  assert.match(home, /<Header \/>[\s\S]*<PrivacyTicker \/>/);
  assert.equal((app.match(/PrivacyTicker/g) ?? []).length, 0);
  for (const path of [
    "../src/pages/CountyStatusPage.jsx",
    "../src/pages/StatewideStatusPage.jsx",
    "../src/pages/PortalDashboard.jsx",
    "../src/components/PortalLogin.jsx",
  ]) {
    assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /PrivacyTicker/);
  }
});

test("warning is exposed once while repeated visual messages are hidden", () => {
  assert.match(component, /<p className="sr-only">\{PRIVACY_WARNING\}<\/p>/);
  assert.match(component, /privacy-ticker__viewport" aria-hidden="true"/);
  assert.equal((component.match(/<p className="sr-only">/g) ?? []).length, 1);
  assert.match(component, /PRIVACY WARNING — Use a reputable VPN when traveling the web to reduce passive network data collection\. They already have enough\./);
});

test("scroll hysteresis collapses after 72px and reopens only near the top", () => {
  assert.equal(PRIVACY_TICKER_HIDE_AT, 72);
  assert.equal(PRIVACY_TICKER_SHOW_AT, 20);
  assert.equal(shouldCollapsePrivacyTicker(false, 48), false);
  assert.equal(shouldCollapsePrivacyTicker(false, 73), true);
  assert.equal(shouldCollapsePrivacyTicker(true, 60), true);
  assert.equal(shouldCollapsePrivacyTicker(true, 21), true);
  assert.equal(shouldCollapsePrivacyTicker(true, 20), false);
});

test("scroll work is passive, animation-frame throttled, and cleaned up", () => {
  assert.match(component, /addEventListener\("scroll", handleScroll, \{ passive: true \}\)/);
  assert.match(component, /requestAnimationFrame\(updateFromScroll\)/);
  assert.match(component, /removeEventListener\("scroll", handleScroll\)/);
  assert.match(component, /cancelAnimationFrame\(frameRef\.current\)/);
});

test("ticker pauses appropriately and reduced motion remains static and visible", () => {
  assert.match(styles, /privacy-ticker:hover \.privacy-ticker__track/);
  assert.match(styles, /privacy-ticker:focus-within \.privacy-ticker__track/);
  assert.match(styles, /animation-play-state: paused/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  assert.match(styles, /white-space: normal/);
});

test("mobile ticker clips its own track without horizontal page overflow", () => {
  assert.match(styles, /privacy-ticker__viewport \{[\s\S]*width: 100%[\s\S]*overflow: hidden/);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.doesNotMatch(styles, /100vw/);
});

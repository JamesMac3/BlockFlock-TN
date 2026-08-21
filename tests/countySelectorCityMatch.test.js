import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { matchCounties } from "../src/utils/countySearch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const counties = [
  { id: 1, name: "Rutherford County", slug: "rutherford", cities: ["Murfreesboro", "Smyrna", "La Vergne"] },
  { id: 2, name: "Davidson County", slug: "davidson", cities: ["Nashville", "Berry Hill"] },
];

test("searching a city returns its county, with the community identified as the match", () => {
  const results = matchCounties(counties, "Murfreesboro", { includeCities: true });
  assert.equal(results.length, 1);
  assert.equal(results[0].county.slug, "rutherford");
  assert.equal(results[0].label, "Murfreesboro");
  assert.equal(results[0].type, "Rutherford County");
});

test("city search is case-insensitive and tolerant of extra whitespace", () => {
  const results = matchCounties(counties, "  murfreesboro  ", { includeCities: true });
  assert.equal(results.length, 1);
  assert.equal(results[0].county.slug, "rutherford");
});

test("county-name search still matches directly", () => {
  const results = matchCounties(counties, "Rutherford", { includeCities: true });
  assert.ok(results.some((result) => result.type === "County result" && result.county.slug === "rutherford"));
});

test("includeCities: false disables community matching entirely (the pre-fix CountyStatusChooser behavior)", () => {
  const results = matchCounties(counties, "Murfreesboro", { includeCities: false });
  assert.equal(results.length, 0);
});

test("CountyStatusChooser no longer disables city/community matching", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "src", "components", "CountyStatusChooser.jsx"),
    "utf8"
  );
  assert.ok(!source.includes("includeCities={false}"), "CountyStatusChooser must not force includeCities to false");
});

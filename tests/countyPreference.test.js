import test from "node:test";
import assert from "node:assert/strict";
import {
  getStoredCountySlug,
  setStoredCountySlug,
  clearStoredCountySlug,
  resolveStoredCounty,
} from "../src/utils/countyPreference.js";

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

function withWindow(localStorageImpl, run) {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const previous = globalThis.window;
  globalThis.window = { localStorage: localStorageImpl };
  try {
    run();
  } finally {
    if (hadWindow) globalThis.window = previous;
    else delete globalThis.window;
  }
}

test("round-trips a stored county slug", () => {
  withWindow(fakeLocalStorage(), () => {
    assert.equal(getStoredCountySlug(), null);
    setStoredCountySlug("rutherford-county");
    assert.equal(getStoredCountySlug(), "rutherford-county");
  });
});

test("clearing removes the stored value", () => {
  withWindow(fakeLocalStorage(), () => {
    setStoredCountySlug("davidson-county");
    clearStoredCountySlug();
    assert.equal(getStoredCountySlug(), null);
  });
});

test("setting an empty/falsy slug is a no-op", () => {
  withWindow(fakeLocalStorage(), () => {
    setStoredCountySlug("");
    assert.equal(getStoredCountySlug(), null);
    setStoredCountySlug(null);
    assert.equal(getStoredCountySlug(), null);
  });
});

test("uses a namespaced, versioned key rather than a bare name", () => {
  const storage = fakeLocalStorage();
  withWindow(storage, () => {
    setStoredCountySlug("wilson-county");
  });
  assert.equal(storage.getItem("flockblock.selectedCounty.v1"), "wilson-county");
});

test("a storage read/write failure (e.g. private browsing) never throws", () => {
  const throwingStorage = {
    getItem: () => { throw new Error("storage disabled"); },
    setItem: () => { throw new Error("storage disabled"); },
    removeItem: () => { throw new Error("storage disabled"); },
  };
  withWindow(throwingStorage, () => {
    assert.doesNotThrow(() => setStoredCountySlug("rutherford-county"));
    assert.doesNotThrow(() => getStoredCountySlug());
    assert.doesNotThrow(() => clearStoredCountySlug());
    assert.equal(getStoredCountySlug(), null);
  });
});

test("no window at all (SSR-safe) never throws and reads as unset", () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const previous = globalThis.window;
  delete globalThis.window;
  try {
    assert.doesNotThrow(() => getStoredCountySlug());
    assert.equal(getStoredCountySlug(), null);
    assert.doesNotThrow(() => setStoredCountySlug("rutherford-county"));
  } finally {
    if (hadWindow) globalThis.window = previous;
  }
});

const COUNTIES = [
  { id: 1, slug: "rutherford-county", name: "Rutherford County" },
  { id: 2, slug: "davidson-county", name: "Davidson County" },
];

test("resolveStoredCounty validates the stored slug against the real current county list", () => {
  withWindow(fakeLocalStorage(), () => {
    setStoredCountySlug("davidson-county");
    assert.deepEqual(resolveStoredCounty(COUNTIES), COUNTIES[1]);
  });
});

test("resolveStoredCounty returns null for a stale/removed county slug — never trusted blindly", () => {
  withWindow(fakeLocalStorage(), () => {
    setStoredCountySlug("a-county-that-no-longer-exists");
    assert.equal(resolveStoredCounty(COUNTIES), null);
  });
});

test("resolveStoredCounty returns null when nothing is stored yet", () => {
  withWindow(fakeLocalStorage(), () => {
    assert.equal(resolveStoredCounty(COUNTIES), null);
  });
});

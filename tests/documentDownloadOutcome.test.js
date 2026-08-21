import test from "node:test";
import assert from "node:assert/strict";
import { resolveDownloadOutcome } from "../src/pages/documentDownloadOutcome.js";

test("Document Download Outcome - normal completion", async (t) => {
  await t.test("a successful download while still active adopts the object URL into state", () => {
    const outcome = resolveDownloadOutcome({ succeeded: true, active: true });
    assert.deepStrictEqual(outcome, { updateState: true, revokeUrl: false });
  });

  await t.test("a failed download while still active updates state to the failed message, no URL to revoke", () => {
    const outcome = resolveDownloadOutcome({ succeeded: false, active: true });
    assert.deepStrictEqual(outcome, { updateState: true, revokeUrl: false });
  });
});

test("Document Download Outcome - cancellation (unmount or route change)", async (t) => {
  await t.test("a download completing after cancellation never updates state", () => {
    const succeededOutcome = resolveDownloadOutcome({ succeeded: true, active: false });
    const failedOutcome = resolveDownloadOutcome({ succeeded: false, active: false });

    assert.strictEqual(succeededOutcome.updateState, false);
    assert.strictEqual(failedOutcome.updateState, false);
  });

  await t.test("an object URL created after cancellation is marked for immediate revocation", () => {
    const outcome = resolveDownloadOutcome({ succeeded: true, active: false });
    assert.strictEqual(outcome.revokeUrl, true);
  });

  await t.test("a cancelled failed download never claims a URL needs revoking (none was created)", () => {
    const outcome = resolveDownloadOutcome({ succeeded: false, active: false });
    assert.strictEqual(outcome.revokeUrl, false);
  });
});

test("Document Download Outcome - exhaustive matrix", async (t) => {
  const cases = [
    { succeeded: true, active: true, expected: { updateState: true, revokeUrl: false } },
    { succeeded: true, active: false, expected: { updateState: false, revokeUrl: true } },
    { succeeded: false, active: true, expected: { updateState: true, revokeUrl: false } },
    { succeeded: false, active: false, expected: { updateState: false, revokeUrl: false } },
  ];

  for (const { succeeded, active, expected } of cases) {
    await t.test(`succeeded=${succeeded} active=${active}`, () => {
      assert.deepStrictEqual(resolveDownloadOutcome({ succeeded, active }), expected);
    });
  }
});

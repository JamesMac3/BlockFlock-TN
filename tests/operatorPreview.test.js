import test from "node:test";
import assert from "node:assert/strict";
import {
  canOperatorPreviewGoalCounty,
  fetchDraftPreviewBundle,
} from "../src/features/document-request/operatorPreview.js";

function fakeSupabase(rpcResult) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, params) => {
      calls.push({ fn, params });
      return rpcResult;
    },
  };
}

test("Operator Preview - client-side county gate mirrors rrg_can_manage_county", async (t) => {
  await t.test("anonymous/no account is denied", () => {
    assert.strictEqual(canOperatorPreviewGoalCounty({ account: null, goalCountyId: 10 }), false);
  });

  await t.test("ordinary authenticated user (no admin/chapter_master role) is denied", () => {
    const account = { role: "member", status: "active", county_id: 10 };
    assert.strictEqual(canOperatorPreviewGoalCounty({ account, goalCountyId: 10 }), false);
  });

  await t.test("administrator is allowed for any county", () => {
    const account = { role: "admin", status: "active", county_id: null };
    assert.strictEqual(canOperatorPreviewGoalCounty({ account, goalCountyId: 10 }), true);
    assert.strictEqual(canOperatorPreviewGoalCounty({ account, goalCountyId: 99 }), true);
  });

  await t.test("chapter master is allowed only for their assigned county", () => {
    const account = { role: "chapter_master", status: "active", county_id: 10 };
    assert.strictEqual(canOperatorPreviewGoalCounty({ account, goalCountyId: 10 }), true);
  });

  await t.test("chapter master is denied for another county", () => {
    const account = { role: "chapter_master", status: "active", county_id: 10 };
    assert.strictEqual(canOperatorPreviewGoalCounty({ account, goalCountyId: 99 }), false);
  });

  await t.test("an inactive assignment is denied even for the correct county and role", () => {
    const adminAccount = { role: "admin", status: "suspended", county_id: null };
    const chapterAccount = { role: "chapter_master", status: "suspended", county_id: 10 };
    assert.strictEqual(canOperatorPreviewGoalCounty({ account: adminAccount, goalCountyId: 10 }), false);
    assert.strictEqual(canOperatorPreviewGoalCounty({ account: chapterAccount, goalCountyId: 10 }), false);
  });
});

test("Operator Preview - fetchDraftPreviewBundle", async (t) => {
  await t.test("returns the bundle on success", async () => {
    const bundle = { goal: { id: 1 }, profile: { id: "p" }, entity: { id: 4 }, evidence: null };
    const supabase = fakeSupabase({ data: bundle, error: null });
    const result = await fetchDraftPreviewBundle({ supabase, goalId: 1 });
    assert.deepStrictEqual(result, { bundle, error: null });
    assert.deepStrictEqual(supabase.calls[0], { fn: "get_draft_request_preview_bundle", params: { p_goal_id: 1 } });
  });

  await t.test("reports a denied/failed call without throwing", async () => {
    const supabase = fakeSupabase({ data: null, error: { message: "Not authorized to preview this goal." } });
    const result = await fetchDraftPreviewBundle({ supabase, goalId: 1 });
    assert.strictEqual(result.bundle, null);
    assert.strictEqual(typeof result.error, "string");
  });

  await t.test("treats missing data with no error as a failure too", async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const result = await fetchDraftPreviewBundle({ supabase, goalId: 1 });
    assert.strictEqual(result.bundle, null);
    assert.strictEqual(typeof result.error, "string");
  });
});

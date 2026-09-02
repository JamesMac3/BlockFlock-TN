import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import postComposerSource from "../../components/post-composer/PostComposer.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import chapterPostsViewSource from "../../components/portal/ChapterPostsView.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import emailCampaignsWorkspaceSource from "../../components/admin/EmailCampaignsWorkspace.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import adminWorkspaceSwitcherSource from "../../components/admin/AdminWorkspaceSwitcher.jsx?raw";

// This project has no component-render test harness (no jsdom), so these
// are source-shape assertions — like the existing tests in
// goal-editor-and-navigation-shape.test.ts — that prove the real source
// implements the required behavior rather than merely describing it.

describe("Chapter-master composer: scope/county are forced from the authenticated account, never client-selectable", () => {
  it("initialValues overwrites scope/countyId to the chapter master's own county, never trusting the post row or prior form state", () => {
    expect(postComposerSource).toMatch(/if \(isChapterMode && chapterCounty\) \{/);
    expect(postComposerSource).toMatch(/return \{ \.\.\.base, scope: "county", countyId: String\(chapterCounty\.id\) \};/);
  });

  it("effectiveScope/effectiveCountyId are forced from chapterCounty and reused for every save/publish/preview, never form.scope/form.countyId directly at those call sites", () => {
    expect(postComposerSource).toMatch(/const effectiveScope = isChapterMode \? "county" : form\.scope;/);
    expect(postComposerSource).toMatch(/const effectiveCountyId = isChapterMode && chapterCounty \? String\(chapterCounty\.id\) : form\.countyId;/);
    expect(postComposerSource).toMatch(/form: isChapterMode \? \{ \.\.\.form, scope: effectiveScope, countyId: effectiveCountyId \} : form,/);
    expect(postComposerSource).toMatch(/p_county_id: isPinned \? null : \(effectiveCountyId \? Number\(effectiveCountyId\) : null\),/);
  });

  it("chapter mode renders a non-editable Audience line instead of the Scope/County selects", () => {
    expect(postComposerSource).toMatch(/isChapterMode \? \(/);
    expect(postComposerSource).toMatch(/<p className="composer-audience-line">Audience: \{chapterCounty\?\.name\}<\/p>/);
  });

  it("the admin branch is untouched — Scope and County selects are still rendered when not in chapter mode", () => {
    expect(postComposerSource).toMatch(/<label>Scope<select value=\{form\.scope\} onChange=\{\(event\) => update\("scope", event\.target\.value\)\}>/);
    expect(postComposerSource).toMatch(/<label>County<select value=\{form\.countyId\} onChange=\{\(event\) => update\("countyId", event\.target\.value\)\} required>/);
  });

  it("ChapterPostsView passes the authenticated account's own county and portal account to the composer, not a client-controlled value", () => {
    expect(chapterPostsViewSource).toMatch(/chapterCounty=\{county\}/);
    expect(chapterPostsViewSource).toMatch(/chapterAccount=\{account\}/);
  });
});

describe("Trusted chapter email campaigns: gated on the live portal_accounts row, not visible text", () => {
  it("trust is exactly status === 'active' AND review_required === false, read from the chapterAccount prop", () => {
    expect(postComposerSource).toMatch(
      /const isTrustedChapterMaster = isChapterMode && chapterAccount\?\.status === "active" && chapterAccount\?\.review_required === false;/,
    );
  });

  it("the campaign screen is only reachable after a successful Publish that reached 'approved', and never for meeting posts", () => {
    expect(postComposerSource).toMatch(
      /if \(isChapterMode && isTrustedChapterMaster && !isMeetingPost && publish && post\.status === "approved"\) \{/,
    );
  });

  it("onComplete is withheld (not called) when the campaign screen is shown, so the composer does not navigate away before the chapter master decides", () => {
    expect(postComposerSource).toMatch(/setPublishedForCampaign\(post\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*\n\s*onComplete\?\.\(post\);/);
  });

  it("the subject defaults to the post title and is capped at 180 characters", () => {
    expect(postComposerSource).toMatch(/setCampaignSubject\(post\.title \?\? ""\);/);
    expect(postComposerSource).toMatch(/maxLength=\{180\}/);
    expect(postComposerSource).toMatch(/subject\.length > 180/);
  });

  it("only rrg_request_post_email_campaign is called — never the worker, never a direct delivery-row insert", () => {
    expect(postComposerSource).toMatch(/supabase\.rpc\("rrg_request_post_email_campaign", \{/);
    expect(postComposerSource).not.toMatch(/email-worker/);
    expect(postComposerSource).not.toMatch(/\.from\("email_deliveries"\)/);
  });

  it("a duplicate/already-active campaign is caught and shown as a friendly message, with the raw error only logged to the console", () => {
    expect(postComposerSource).toMatch(/campaignRpcError\.code === "23505"/);
    expect(postComposerSource).toMatch(/already awaiting administrator review/);
    expect(postComposerSource).toMatch(/console\.error\("Email campaign request failed:", campaignRpcError\);/);
  });

  it("the exact required success message is shown verbatim on a successful request", () => {
    expect(postComposerSource).toMatch(/Email campaign submitted for administrator approval\./);
  });

  it("repeated clicks are guarded by a ref lock checked before the RPC call, not just a disabled button", () => {
    const fnBlock = postComposerSource.match(/async function requestEmailCampaign\(\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(fnBlock).not.toBe("");
    expect(fnBlock).toMatch(/if \(campaignLockRef\.current \|\| !publishedForCampaign\) return;/);
    expect(fnBlock).toMatch(/campaignLockRef\.current = true;/);
  });
});

describe("Admin Email Campaigns workspace: correct RPC contract, no subscriber emails, statewide confirmation", () => {
  it("lists campaigns via rrg_list_email_campaigns and reviews via rrg_admin_review_email_campaign — the existing backend contract, not a reimplementation", () => {
    expect(emailCampaignsWorkspaceSource).toMatch(/supabase\.rpc\("rrg_list_email_campaigns", \{/);
    expect(emailCampaignsWorkspaceSource).toMatch(/supabase\.rpc\("rrg_admin_review_email_campaign", \{/);
  });

  it("never selects county_contacts or email_deliveries directly, so no subscriber email address can be exposed", () => {
    expect(emailCampaignsWorkspaceSource).not.toMatch(/county_contacts/);
    expect(emailCampaignsWorkspaceSource).not.toMatch(/email_deliveries/);
    expect(emailCampaignsWorkspaceSource).not.toMatch(/recipient_email/);
  });

  it("approving a statewide (global) campaign requires an explicit confirmation first", () => {
    expect(emailCampaignsWorkspaceSource).toMatch(/if \(approve && row\.target_scope === "global"\) \{/);
    expect(emailCampaignsWorkspaceSource).toMatch(/window\.confirm\(/);
  });

  it("pagination defaults to page size 25 via the shared clampPageSize helper", () => {
    expect(emailCampaignsWorkspaceSource).toMatch(/pageSize: 25/);
    expect(emailCampaignsWorkspaceSource).toMatch(/clampPageSize\(criteria\.pageSize\)/);
  });

  it("delivery totals are refreshed only by an explicit Refresh button, not an automatic polling loop", () => {
    expect(emailCampaignsWorkspaceSource).not.toMatch(/setInterval/);
    expect(emailCampaignsWorkspaceSource).toMatch(/onClick=\{load\}/);
  });

  it("is wired into the admin workspace switcher", () => {
    expect(adminWorkspaceSwitcherSource).toMatch(/\{ id: "email-campaigns", label: "Email Campaigns" \}/);
  });
});

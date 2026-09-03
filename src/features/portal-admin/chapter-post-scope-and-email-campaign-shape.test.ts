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

describe("Trusted chapter email campaigns: one atomic Publish action, no second screen or RPC", () => {
  it("trust is exactly status === 'active' AND review_required === false, read from the chapterAccount prop", () => {
    expect(postComposerSource).toMatch(
      /const isTrustedChapterMaster = isChapterMode && chapterAccount\?\.status === "active" && chapterAccount\?\.review_required === false;/,
    );
  });

  it("the campaign checkbox is rendered only when canRequestCampaign (trusted, no existing campaign), inside Publication settings, with the exact required label and hint text", () => {
    const settingsBlock = postComposerSource.match(/<details className="composer-publication-settings">[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(settingsBlock).not.toBe("");
    expect(settingsBlock).toMatch(/canRequestCampaign && \(/);
    expect(settingsBlock).toMatch(/Request a county email campaign/);
    expect(settingsBlock).toMatch(
      /The post will be published now\. The email campaign will be sent to an administrator for approval before delivery\./,
    );
  });

  it("a restricted (untrusted) chapter master renders nothing for the campaign option — it's a plain && guard (canRequestCampaign, which requires isTrustedChapterMaster), never a ternary with a disabled/explained alternate branch", () => {
    expect(postComposerSource).toMatch(/canRequestCampaign && \(/);
    expect(postComposerSource).not.toMatch(/isTrustedChapterMaster \? /);
  });

  it("the subject defaults live to the post title and is capped at 180 characters, required after trimming", () => {
    expect(postComposerSource).toMatch(/value=\{campaignSubject \|\| form\.title\}/);
    expect(postComposerSource).toMatch(/maxLength=\{180\}/);
    expect(postComposerSource).toMatch(/if \(subject\.length > 180\) return "Email subject must be 180 characters or fewer\.";/);
  });

  it("publishing (save()) calls exactly one atomic RPC — rrg_publish_post_with_email_campaign — and never rrg_request_post_email_campaign directly (that RPC is only ever called from the separate requestCampaignOnly action, see below); never the worker or a direct delivery-row insert", () => {
    const saveBlock = postComposerSource.slice(
      postComposerSource.indexOf("async function save(publish)"),
      postComposerSource.indexOf("// Requesting a campaign for an already-published post"),
    );
    expect(saveBlock).toMatch(/supabase\.rpc\("rrg_publish_post_with_email_campaign", \{/);
    expect(saveBlock).not.toMatch(/rrg_request_post_email_campaign/);
    expect(postComposerSource).not.toMatch(/email-worker/);
    expect(postComposerSource).not.toMatch(/\.from\("email_deliveries"\)/);
  });

  it("requestEmail is exactly isTrustedChapterMaster && wantsEmailCampaign && no campaign already exists, so a restricted account or a post with an existing campaign can never send p_request_email: true", () => {
    expect(postComposerSource).toMatch(
      /const requestEmail = isTrustedChapterMaster && wantsEmailCampaign && !campaignState\?\.requested;/,
    );
  });

  it("unchecked publishing sends p_request_email: false and p_subject: null — the subject is only computed when requestEmail is true", () => {
    expect(postComposerSource).toMatch(/const subject = requestEmail \? \(campaignSubject \|\| form\.title\)\.trim\(\) : null;/);
    expect(postComposerSource).toMatch(/p_request_email: requestEmail,\s*\n\s*p_subject: subject,/);
  });

  it("a failed publish never claims success, keeps the composer open for another attempt, and never separately retries the campaign", () => {
    const chapterBranch = postComposerSource.match(/if \(isChapterMode\) \{[\s\S]*?\n      \} else \{/)?.[0] ?? "";
    expect(chapterBranch).not.toBe("");
    expect(chapterBranch).toMatch(/console\.error\("Publish failed:", rpcError\);/);
    expect(chapterBranch).toMatch(/setError\("The post could not be published\. Please try again\."\);/);
    expect(chapterBranch).toMatch(/setRetryPublish\(publish\);/);
    expect(chapterBranch).toMatch(/return;/);
    expect(chapterBranch).not.toMatch(/rrg_request_post_email_campaign/);
  });

  it("success copy is exact for all three outcomes: approved without campaign, approved with campaign, and pending review", () => {
    expect(postComposerSource).toMatch(/"Post submitted for administrator review\."/);
    expect(postComposerSource).toMatch(/"Post published\. The email campaign was sent for administrator approval\."/);
    expect(postComposerSource).toMatch(/: "Post published\.",/);
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

describe("Published-post email campaign indicator: immutable panel once requested, never a second control", () => {
  it("campaign state is fetched only when opening an existing approved post — never for drafts/pending, and not gated to chapter mode, so admins see it too", () => {
    expect(postComposerSource).toMatch(/if \(!initialPost \|\| initialPost\.status !== "approved"\) return undefined;/);
    expect(postComposerSource).toMatch(/supabase\.rpc\("rrg_get_post_email_campaign_state", \{/);
  });

  it("a requested campaign renders the exact immutable panel copy, using Chicago-formatted date/time helpers — never a raw ISO string", () => {
    const panelBlock = postComposerSource.match(/<div className="composer-campaign-status" role="status">[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(panelBlock).not.toBe("");
    expect(panelBlock).toMatch(/Email batch requested/);
    expect(panelBlock).toMatch(/Requested \{formatChicagoDate\(campaignState\.requested_at\)\} at \{formatChicagoTime\(campaignState\.requested_at\)\}/);
    expect(panelBlock).toMatch(/Subject: \{campaignState\.subject\}/);
    expect(panelBlock).toMatch(/Status: \{friendlyCampaignStatus\(campaignState\.status\)\}/);
    expect(panelBlock).toMatch(/This email request cannot be changed, cancelled, or submitted again\./);
    expect(panelBlock).not.toMatch(/requested_at\}<\/p>/);
  });

  it("no resend/retry/cancel/undo control exists anywhere inside the panel", () => {
    const panelBlock = postComposerSource.match(/<div className="composer-campaign-status" role="status">[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(panelBlock).not.toMatch(/<button/);
    expect(panelBlock).not.toMatch(/<input/);
  });

  it("the panel and the request checkbox/subject field are mutually exclusive branches of one ternary — a campaign can never coexist with a visible request control", () => {
    expect(postComposerSource).toMatch(/\{campaignState\?\.requested \? \(/);
    expect(postComposerSource).toMatch(/\) : \(\s*canRequestCampaign && \(/);
  });

  it("a draft trusted chapter master (no campaign yet) still sees the ordinary checkbox and subject field", () => {
    expect(postComposerSource).toMatch(/Request a county email campaign/);
    expect(postComposerSource).toMatch(/composer-campaign-option__subject/);
  });

  it("a fresh publish that requested a campaign updates local state immediately, so a still-mounted composer shows the panel — not the checkbox — right after", () => {
    expect(postComposerSource).toMatch(/if \(campaignStatus\) \{\s*\n\s*setCampaignState\(\{/);
    expect(postComposerSource).toMatch(/requested: true,/);
  });

  it("a stale-state uniqueness error refreshes the real campaign state and clears the checkbox instead of leaving it reusable", () => {
    expect(postComposerSource).toMatch(/already been requested for this post/i);
    expect(postComposerSource).toMatch(/setWantsEmailCampaign\(false\);/);
    expect(postComposerSource).toMatch(/if \(refreshedState\) setCampaignState\(refreshedState\);/);
  });
});

describe("Requesting an email campaign for an already-published post: standalone action, never touches the post row", () => {
  it("an approved chapter post is detected, and the entire action bar branches on it — Save draft/Publish are structurally excluded from that branch", () => {
    expect(postComposerSource).toMatch(/const isApprovedChapterPost = isChapterMode && initialPost\?\.status === "approved";/);
    const actionsBlock = postComposerSource.match(/<div className="composer-actions composer-actions--sticky">[\s\S]*/)?.[0] ?? "";
    expect(actionsBlock).toMatch(/\{isApprovedChapterPost \? \(/);
    const [approvedBranch, restBranch] = actionsBlock.split(") : (");
    expect(approvedBranch).not.toMatch(/Save draft/);
    expect(approvedBranch).not.toMatch(/save\(true\)/);
    expect(approvedBranch).not.toMatch(/save\(false\)/);
    expect(restBranch).toMatch(/Save draft/);
    expect(restBranch).toMatch(/save\(true\)/);
  });

  it("requestCampaignOnly calls exactly rrg_request_post_email_campaign with the post's own id and the trimmed subject, falling back to the post's title", () => {
    const fnBlock = postComposerSource.match(/async function requestCampaignOnly\(\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(fnBlock).not.toBe("");
    expect(fnBlock).toMatch(/const subject = campaignSubject\.trim\(\) \|\| savedPost\.title;/);
    expect(fnBlock).toMatch(/supabase\.rpc\("rrg_request_post_email_campaign", \{/);
    expect(fnBlock).toMatch(/p_post_id: savedPost\.id,/);
    expect(fnBlock).toMatch(/p_subject: subject,/);
  });

  it("requestCampaignOnly never updates posts, persists media, or calls rrg_submit_post / rrg_publish_post_with_email_campaign", () => {
    const fnBlock = postComposerSource.match(/async function requestCampaignOnly\(\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(fnBlock).not.toMatch(/\.from\("posts"\)/);
    expect(fnBlock).not.toMatch(/persistPostMedia/);
    expect(fnBlock).not.toMatch(/buildDraftPostPayload/);
    expect(fnBlock).not.toMatch(/rrg_submit_post/);
    expect(fnBlock).not.toMatch(/rrg_publish_post_with_email_campaign/);
  });

  it("the Request email campaign button is offered only when canRequestCampaign — trusted, no existing campaign, not still loading", () => {
    expect(postComposerSource).toMatch(
      /const canRequestCampaign = isTrustedChapterMaster && !campaignExists && !campaignLoading;/,
    );
    const actionsBlock = postComposerSource.match(/<div className="composer-actions composer-actions--sticky">[\s\S]*/)?.[0] ?? "";
    expect(actionsBlock).toMatch(/canRequestCampaign && \(/);
    expect(actionsBlock).toMatch(/onClick=\{requestCampaignOnly\}/);
  });

  it("an existing campaign (campaignExists) makes canRequestCampaign false, so the request button and checkbox can never appear once a campaign is already on record", () => {
    expect(postComposerSource).toMatch(/const campaignExists = campaignState\?\.requested === true;/);
  });

  it("draft publishing (not yet approved) is unaffected — Publish still calls the atomic rrg_publish_post_with_email_campaign RPC", () => {
    expect(postComposerSource).toMatch(/supabase\.rpc\("rrg_publish_post_with_email_campaign", \{/);
  });

  it("restricted chapter masters never see the request action, since canRequestCampaign requires isTrustedChapterMaster", () => {
    const settingsBlock = postComposerSource.match(/<details className="composer-publication-settings">[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(settingsBlock).toMatch(/canRequestCampaign && \(/);
    expect(settingsBlock).not.toMatch(/isTrustedChapterMaster && \(/);
  });

  it("the approved-post hint text says the post is already published, not that it will be published now", () => {
    expect(postComposerSource).toMatch(
      /This post is already published\. The email campaign will be sent to an administrator for approval before delivery\./,
    );
  });

  it("a stale-state uniqueness error inside requestCampaignOnly refreshes the real campaign state and clears the checkbox instead of leaving it reusable", () => {
    const fnBlock = postComposerSource.match(/async function requestCampaignOnly\(\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(fnBlock).toMatch(/already been requested for this post/i);
    expect(fnBlock).toMatch(/setWantsEmailCampaign\(false\);/);
    expect(fnBlock).toMatch(/if \(refreshedState\) setCampaignState\(refreshedState\);/);
  });
});

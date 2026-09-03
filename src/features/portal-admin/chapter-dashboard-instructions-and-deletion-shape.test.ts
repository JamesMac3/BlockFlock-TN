import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import chapterPostsViewSource from "../../components/portal/ChapterPostsView.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import contentManagementTableSource from "../../components/admin/ContentManagementTable.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import portalDashboardSource from "../../pages/PortalDashboard.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import adminPostDashboardSource from "../../components/admin/AdminPostDashboard.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import chapterInstructionsContentSource from "../../components/portal/ChapterInstructionsContent.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import adminDashboardViewsSource from "../../utils/adminDashboardViews.js?raw";

// This project has no component-render test harness (no jsdom), so these
// are source-shape assertions that prove the real source implements the
// required behavior rather than merely describing it. adminDashboardViews.js
// is untyped (no .d.ts), so it's read via ?raw here too, like every other
// source file in this suite, rather than imported live (which would fail
// tsc under tsconfig.pdf.json's strict scope).

describe("Chapter dashboard: trust-derived summary card visibility", () => {
  it("admin's own dashboard views are untouched — still labeled 'Admin Drafts', all 5 present, in the shared constant ChapterPostsView.jsx filters/relabels rather than replaces", () => {
    expect(adminDashboardViewsSource).toMatch(/\{ id: "drafts", label: "Admin Drafts", heading: "Admin Drafts", listType: "posts" \}/);
    expect(adminDashboardViewsSource).toMatch(
      /\{ id: "pending"[\s\S]*?\{ id: "drafts"[\s\S]*?\{ id: "published"[\s\S]*?\{ id: "returned"[\s\S]*?\{ id: "meetings"/,
    );
  });

  it("chapter view sets are exactly as specified: trusted hides Pending Review/Returned, restricted shows all five", () => {
    expect(chapterPostsViewSource).toMatch(
      /trusted: \["drafts", "published", "meetings"\],\s*\n\s*restricted: \["drafts", "pending", "published", "returned", "meetings"\],/,
    );
  });

  it("'Admin Drafts' is renamed to exactly 'Drafts' only on the chapter dashboard, via a text override applied on top of the shared ADMIN_DASHBOARD_VIEWS constant", () => {
    expect(chapterPostsViewSource).toMatch(/const CHAPTER_VIEW_TEXT_OVERRIDES = \{ drafts: \{ label: "Drafts", heading: "Drafts" \} \};/);
    expect(chapterPostsViewSource).toMatch(/import \{\s*\n\s*ADMIN_DASHBOARD_VIEWS,/);
  });

  it("trust is derived from describeAccountState (status/review_required), never from a displayed label", () => {
    expect(chapterPostsViewSource).toMatch(/const trustState = describeAccountState\(account \?\? \{\}\)\.state;/);
  });

  it("a currently-selected view that becomes hidden is reselected by pure render-time derivation, not a corrective effect or a page refresh", () => {
    expect(chapterPostsViewSource).toMatch(
      /const activeView = chapterViews\.some\(\(view\) => view\.id === rawActiveView\) \? rawActiveView : \(chapterViews\[0\]\?\.id \?\? "drafts"\);/,
    );
    expect(chapterPostsViewSource).not.toMatch(/window\.location\.reload/);
    // Guards against reintroducing a setState-in-effect anti-pattern for
    // this specific concern (react-hooks/set-state-in-effect flags it).
    expect(chapterPostsViewSource).not.toMatch(/setActiveView\(chapterViews/);
  });

  it("the overview grid and section heading render from chapterViews, not the unfiltered ADMIN_DASHBOARD_VIEWS", () => {
    expect(chapterPostsViewSource).toMatch(/\{chapterViews\.map\(\(view\) => \(/);
    expect(chapterPostsViewSource).toMatch(/const activeDefinition = chapterViews\.find\(\(view\) => view\.id === activeView\) \?\? chapterViews\[0\];/);
  });
});

describe("Trusted chapter post deletion: standalone RPC, own-row gating, no new query for campaign state", () => {
  it("ChapterPostsView only ever passes onDelete when trustState is 'trusted'", () => {
    expect(chapterPostsViewSource).toMatch(/onDelete=\{trustState === "trusted" \? handleDeletePost : undefined\}/);
  });

  it("handleDeletePost calls exactly rrg_delete_post with the post's own id", () => {
    const fnBlock = chapterPostsViewSource.match(/async function handleDeletePost\(post\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(fnBlock).not.toBe("");
    expect(fnBlock).toMatch(/supabase\.rpc\("rrg_delete_post", \{ p_post_id: post\.id \}\);/);
  });

  it("the confirmation dialog names the post and states permanent removal from the public feed, before the RPC is ever called", () => {
    const fnBlock = chapterPostsViewSource.match(/async function handleDeletePost\(post\)[\s\S]*?\n  \}/)?.[0] ?? "";
    const confirmIndex = fnBlock.search(/window\.confirm\(`Delete "\$\{post\.title\}"\? This post will be permanently removed from the public feed\.`\)/);
    const rpcIndex = fnBlock.search(/rrg_delete_post/);
    expect(confirmIndex).toBeGreaterThan(-1);
    expect(rpcIndex).toBeGreaterThan(confirmIndex);
  });

  it("a declined confirmation never reaches the RPC", () => {
    const fnBlock = chapterPostsViewSource.match(/async function handleDeletePost\(post\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(fnBlock).toMatch(/if \(!confirmed\) return;/);
  });

  it("an email-campaign rejection (errcode 23503) shows the exact friendly retention message; raw errors are only logged to the console", () => {
    const fnBlock = chapterPostsViewSource.match(/async function handleDeletePost\(post\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(fnBlock).toMatch(/console\.error\("Post deletion failed:", rpcError\);/);
    expect(fnBlock).toMatch(/rpcError\.code === "23503"/);
    expect(fnBlock).toMatch(/This post has an email campaign and must be retained for delivery records\./);
  });

  it("on success, the row is removed from local state (no full reload) and the editor is closed if the deleted post was open", () => {
    const fnBlock = chapterPostsViewSource.match(/async function handleDeletePost\(post\)[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(fnBlock).toMatch(/setPosts\(\(current\) => current\.filter\(\(item\) => item\.id !== post\.id\)\);/);
    expect(fnBlock).toMatch(/if \(editingPost\?\.id === post\.id\) \{/);
  });

  it("already-known campaign history (mass_email_requested, already loaded with every post row) short-circuits before any confirmation or RPC call — no new query", () => {
    expect(chapterPostsViewSource).toMatch(/async function handleDeletePost\(post\) \{\s*\n\s*if \(post\.mass_email_requested\) return;/);
    expect(chapterPostsViewSource).toMatch(/"mass_email_requested"/);
  });

  it("ManagementActions renders the delete button only when onDelete is supplied by the caller, and disables it (with an accessible explanation) when the row already has a campaign", () => {
    const fnBlock = contentManagementTableSource.match(/function ManagementActions\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(fnBlock).not.toBe("");
    expect(fnBlock).toMatch(/const hasCampaign = record\.mass_email_requested === true;/);
    expect(fnBlock).toMatch(/\{onDelete && \(/);
    expect(fnBlock).toMatch(/disabled=\{hasCampaign\}/);
    expect(fnBlock).toMatch(/aria-label=\{hasCampaign \?/);
  });

  it("the admin post dashboard never passes onDelete — administrator post controls are unchanged", () => {
    expect(adminPostDashboardSource).not.toMatch(/onDelete/);
  });
});

describe("Instructions popout: reuses AdminPopout, chapter-only, admin dashboard untouched", () => {
  it("PortalDashboard renders the Instructions control using the existing white-outline tab-nav style, inside a nav labeled for portal help", () => {
    expect(portalDashboardSource).toMatch(/<nav className="tab-nav" aria-label="Portal help">/);
    expect(portalDashboardSource).toMatch(/<button type="button" className="tab-nav__item" onClick=\{\(\) => setInstructionsOpen\(true\)\}>/);
  });

  it("the popout is the existing shared AdminPopout component, not a new one-off implementation", () => {
    expect(portalDashboardSource).toMatch(/import AdminPopout from "\.\.\/components\/admin\/AdminPopout";/);
    expect(portalDashboardSource).toMatch(/<AdminPopout title="Chapter Portal Instructions" onClose=\{\(\) => setInstructionsOpen\(false\)\}>/);
  });

  it("the Instructions button and popout are only reachable from the chapter branch — the admin branch returns before either is rendered", () => {
    const adminBranch = portalDashboardSource.slice(
      portalDashboardSource.indexOf("if (isAdmin) {"),
      portalDashboardSource.indexOf("<TabNav"),
    );
    expect(adminBranch).not.toBe("");
    expect(adminBranch).not.toMatch(/Instructions/);
    expect(adminBranch).not.toMatch(/instructionsOpen/);
  });

  it("instructional content covers every required section without any embedded fake image, only labeled placeholders", () => {
    for (const heading of ["Portal overview", "Posts", "Email campaigns", "Meetings", "Records Request Goals", "Archive Documents", "County Statistics", "Account Settings"]) {
      expect(chapterInstructionsContentSource).toMatch(new RegExp(`<h4>${heading}</h4>`));
    }
    expect(chapterInstructionsContentSource).not.toMatch(/<img/);
    expect(chapterInstructionsContentSource).toMatch(/Image placeholder:/);
    expect(chapterInstructionsContentSource).toMatch(/Only one campaign may be requested per post\./);
    expect(chapterInstructionsContentSource).toMatch(/Never publish private requester information, passwords, identification scans/);
  });
});

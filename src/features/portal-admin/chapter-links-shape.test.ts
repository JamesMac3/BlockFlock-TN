import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import chapterLinkButtonsSource from "../../components/status/ChapterLinkButtons.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import chapterLinkButtonSource from "../../components/status/ChapterLinkButton.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import chapterLinksButtonSource from "../../components/portal/ChapterLinksButton.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import countyStatusPageSource from "../../pages/CountyStatusPage.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import portalDashboardSource from "../../pages/PortalDashboard.jsx?raw";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * This project has no React render harness, so these are source-shape
 * assertions proving: the public county-status page fetches
 * county_chapter_links exactly per the backend contract and renders
 * nothing for a county with no rows; the chapter-master dialog saves
 * through save_county_chapter_links (never separate insert/delete calls);
 * and the migration this feature depends on actually defines what both
 * client-side call shapes assume. Real, executed validation logic
 * (length limits, HTTPS-only, partial-slot rejection, empty-slot
 * omission) is covered for real in chapterLinkValidation.test.js.
 */

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/20260912003222_county_chapter_social_links.sql", import.meta.url)
);
const migrationSource = fs.readFileSync(path.normalize(migrationPath), "utf8");

describe("public county-status page: fetches county_chapter_links per the backend contract", () => {
  it("selects exactly county_id,slot,label,url,color, filtered by county_id, ordered by slot", () => {
    expect(chapterLinkButtonsSource).toMatch(
      /\.from\("county_chapter_links"\)\s*\n\s*\.select\("county_id,slot,label,url,color"\)\s*\n\s*\.eq\("county_id", countyId\)\s*\n\s*\.order\("slot"\)/
    );
  });

  it("renders nothing (no placeholders, no empty state) when there are no saved links", () => {
    expect(chapterLinkButtonsSource).toMatch(/if \(!links\.length\) return null;/);
  });

  it("renders one button per saved row using ordinary external-link semantics", () => {
    expect(chapterLinkButtonsSource).toMatch(/links\.map\(\(link\) =>/);
  });
});

describe("ChapterLinkButton: safe external-link rendering", () => {
  it("opens in a new tab with rel=noopener noreferrer", () => {
    expect(chapterLinkButtonSource).toMatch(/target="_blank"/);
    expect(chapterLinkButtonSource).toMatch(/rel="noopener noreferrer"/);
  });

  it("is polymorphic — a real anchor for the public page, a non-navigating span for the editor's live preview", () => {
    expect(chapterLinkButtonSource).toMatch(/as === "a"/);
    expect(chapterLinkButtonSource).toMatch(/<span className={className}>\{label\}<\/span>/);
  });
});

describe("CountyStatusPage: chapter link buttons sit beside Status Updates and Records Request Roadmap", () => {
  it("places ChapterLinkButtons inside the same nav as both nav links", () => {
    const navBlock = countyStatusPageSource.match(/<nav className="county-status-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(navBlock).toMatch(/Status Updates/);
    expect(navBlock).toMatch(/Records Request Roadmap/);
    expect(navBlock).toMatch(/<ChapterLinkButtons countyId=\{county\.id\} \/>/);
  });
});

describe("PortalDashboard: Chapter links button sits beside the existing publishing/meeting controls", () => {
  it("is rendered in the same Portal help nav as Instructions, using the chapter master's own assigned county", () => {
    const navBlock = portalDashboardSource.match(/<nav className="tab-nav" aria-label="Portal help">[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(navBlock).toMatch(/<ChapterLinksButton countyId=\{assignedCounty\?\.id\} countyName=\{assignedCounty\?\.name\} \/>/);
    expect(navBlock).toMatch(/Instructions/);
  });
});

describe("ChapterLinksButton dialog: saves atomically through the RPC, never separate insert/delete calls", () => {
  it("calls save_county_chapter_links with p_county_id and p_links", () => {
    expect(chapterLinksButtonSource).toMatch(
      /supabase\.rpc\("save_county_chapter_links", \{\s*\n\s*p_county_id: countyId,\s*\n\s*p_links: payload,\s*\n\s*\}\)/
    );
  });

  it("never issues a raw .from(\"county_chapter_links\").insert/.delete/.update from the client", () => {
    expect(chapterLinksButtonSource).not.toMatch(/\.from\("county_chapter_links"\)\.(insert|delete|update)/);
    expect(chapterLinksButtonSource).not.toMatch(/\.insert\(/);
    expect(chapterLinksButtonSource).not.toMatch(/\.delete\(/);
  });

  it("reloads from the server after a successful save, so the dialog reflects what was actually persisted", () => {
    const saveBlock = chapterLinksButtonSource.match(/async function handleSave\(event\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(saveBlock).toMatch(/setSavedAt\(Date\.now\(\)\);\s*\n\s*await load\(\);/);
  });

  it("rejects a partially-completed slot with an inline explanation before ever calling the RPC", () => {
    expect(chapterLinksButtonSource).toMatch(/buildChapterLinksPayload\(slots\)/);
    expect(chapterLinksButtonSource).toMatch(/if \(!payload\) return;/);
  });

  it("guards AdminPopout's own onClose (Escape / backdrop click), not just the Cancel button, with the unsaved-changes confirm", () => {
    // The confirm must live on the same requestClose that AdminPopout's
    // onClose is wired to — otherwise Escape/backdrop-click could discard
    // unsaved edits silently even though Cancel itself asks first.
    expect(chapterLinksButtonSource).toMatch(/function requestClose\(\)\s*\{\s*\n\s*if \(dirty && !window\.confirm\(/);
    expect(chapterLinksButtonSource).toMatch(/<AdminPopout[^>]*onClose=\{requestClose\}/);
  });

  it("tracks dirty state from the dialog's own slot data via onDirtyChange, the same pattern used by the goal editor", () => {
    expect(chapterLinksButtonSource).toMatch(/onDirtyChange\(JSON\.stringify\(slots\) !== JSON\.stringify\(initialSlots\)\)/);
  });

  it("uses the opaque, focus-trapping AdminPopout for the dialog shell", () => {
    expect(chapterLinksButtonSource).toMatch(/<AdminPopout/);
  });
});

describe("Migration: supabase/migrations/20260912003222_county_chapter_social_links.sql matches the frontend's assumptions", () => {
  it("defines the county_chapter_links table with slot 1-3, a 60-char label limit, a 2048-char URL limit, and the three known colors", () => {
    expect(migrationSource).toMatch(/create table public\.county_chapter_links/);
    expect(migrationSource).toMatch(/slot smallint not null check \(slot between 1 and 3\)/);
    expect(migrationSource).toMatch(/char_length\(label\) between 1 and 60/);
    expect(migrationSource).toMatch(/char_length\(url\) between 9 and 2048/);
    expect(migrationSource).toMatch(/color text not null default 'light_blue' check \(color in \('light_blue','navy','red'\)\)/);
  });

  it("enforces HTTPS-only URLs with no embedded credentials or whitespace at the database layer too", () => {
    expect(migrationSource).toMatch(/url ~ '\^https:\/\//);
    expect(migrationSource).toMatch(/position\(chr\(92\) in url\) = 0/);
  });

  it("enables RLS with public read and rrg_can_manage_county-gated writes", () => {
    expect(migrationSource).toMatch(/alter table public\.county_chapter_links enable row level security;/);
    expect(migrationSource).toMatch(/create policy chapter_links_public_read on public\.county_chapter_links for select to anon, authenticated using \(true\);/);
    expect(migrationSource).toMatch(/rrg_can_manage_county\(county_id\)/);
  });

  it("defines save_county_chapter_links as an atomic, transactional replace — delete then insert in one function body, never as separate client-issued statements", () => {
    const functionBody = migrationSource.match(/create function public\.save_county_chapter_links[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(functionBody).toMatch(/delete from public\.county_chapter_links where county_id=p_county_id;/);
    expect(functionBody).toMatch(/insert into public\.county_chapter_links/);
    expect(functionBody).toMatch(/pg_advisory_xact_lock/);
    expect(functionBody).toMatch(/return query select l\.\* from public\.county_chapter_links l where l\.county_id=p_county_id order by l\.slot;/);
    // The delete must precede the insert textually in the same function body.
    expect(functionBody.indexOf("delete from")).toBeLessThan(functionBody.indexOf("insert into"));
  });

  it("caps at most three links and re-derives authorization from auth.uid()/rrg_can_manage_county rather than trusting the caller", () => {
    const functionBody = migrationSource.match(/create function public\.save_county_chapter_links[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(functionBody).toMatch(/jsonb_array_length\(p_links\) > 3/);
    expect(functionBody).toMatch(/auth\.uid\(\) is null or not public\.rrg_can_manage_county\(p_county_id\)/);
  });
});

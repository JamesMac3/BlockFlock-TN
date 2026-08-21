import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import postComposerSource from "../../components/post-composer/PostComposer.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import homePageSource from "../../pages/Home/HomePage.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import tennesseeCountyMapSource from "../../components/jurisdiction-map/TennesseeCountyMap.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import archivePageSource from "../../pages/ArchivePage.jsx?raw";

describe("PostComposer: meeting posts are saved through the single transactional RPC", () => {
  it("any post with content_type 'meeting' (quick-create or switched via the dropdown) is treated as a meeting post", () => {
    expect(postComposerSource).toMatch(/const isMeetingPost = meetingOnly \|\| form\.contentType === "meeting";/);
  });

  it("a meeting post is saved via rrg_save_post_with_meeting", () => {
    expect(postComposerSource).toMatch(/supabase\.rpc\("rrg_save_post_with_meeting"/);
  });

  it("never sends a caller-controlled status — only p_submit, which the RPC uses to decide whether to call rrg_submit_post", () => {
    const rpcCallBlock = postComposerSource.match(/rrg_save_post_with_meeting", \{[\s\S]*?\n {6}\}\);/)?.[0] ?? "";
    expect(rpcCallBlock).not.toBe("");
    expect(rpcCallBlock).not.toMatch(/p_status:/);
    expect(rpcCallBlock).toMatch(/p_submit: publish/);
  });

  it("collects structured location fields (venue name, street address, city, fixed TN state, optional ZIP) instead of freeform event fields for a meeting post", () => {
    expect(postComposerSource).toMatch(/p_location_name: form\.locationName/);
    expect(postComposerSource).toMatch(/p_street_address: form\.streetAddress/);
    expect(postComposerSource).toMatch(/p_city: form\.city/);
    expect(postComposerSource).toMatch(/p_state: "TN"/);
    expect(postComposerSource).toMatch(/p_postal_code: form\.postalCode \|\| null/);
  });

  it("validation requires the meeting date/time and a complete location before either Save Draft or Publish can succeed", () => {
    const validateBlock = postComposerSource.match(/function validate\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(validateBlock).toMatch(/if \(isMeetingPost\) \{/);
    expect(validateBlock).toMatch(/if \(!form\.eventStart\) return/);
    expect(validateBlock).toMatch(/if \(!form\.locationName\.trim\(\) \|\| !form\.streetAddress\.trim\(\) \|\| !form\.city\.trim\(\)\) \{/);
  });
});

describe("Homepage: standalone next-meeting banner near the hero, using the shared public selector", () => {
  it("renders NextMeetingBanner with no county (statewide pinned fallback)", () => {
    expect(homePageSource).toMatch(/<NextMeetingBanner countyId=\{null\} \/>/);
  });
});

describe("County map/container: meeting text sourced from the real selector, never a fabricated placeholder date", () => {
  it("no longer invents a 'next Saturday at 3pm' placeholder meeting", () => {
    expect(tennesseeCountyMapSource).not.toMatch(/daysUntilSaturday/);
    expect(tennesseeCountyMapSource).not.toMatch(/Placeholder date and location/);
  });

  it("sources meeting data from fetchNextMeeting (the same shared selector as every other public surface)", () => {
    expect(tennesseeCountyMapSource).toMatch(/fetchNextMeeting\(supabase, countyId \?\? null\)/);
  });

  it("renders nothing for the meeting detail row when there is no meeting", () => {
    expect(tennesseeCountyMapSource).toMatch(/\{meeting && \(/);
  });
});

describe("Public archive Investigative Goals: Tier column and 5/10/25 page-size choices (default 5)", () => {
  it("adds a Tier column to the table", () => {
    expect(archivePageSource).toMatch(/<th>Tier<\/th>/);
    expect(archivePageSource).toMatch(/<td>\{row\.tier \?\? "—"\}<\/td>/);
  });

  it("page size choices are exactly [5, 10, 25], defaulting to 5", () => {
    expect(archivePageSource).toMatch(/const PAGE_SIZE_CHOICES = \[5, 10, 25\];/);
    expect(archivePageSource).toMatch(/const DEFAULT_PAGE_SIZE = 5;/);
  });

  it("changing the page size resets to page 1, matching every other paginated view in this app", () => {
    const handlerBlock = archivePageSource.match(/function handlePageSizeChange\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(handlerBlock).toMatch(/setPage\(1\);/);
  });

  // The no-argument RPC remains the public archive contract. Its database
  // implementation now includes unlocked ready/received/published goals;
  // this component owns only client-side search, sort, and pagination.
  it("still calls the existing get_public_archive_goals() RPC — no new server-side pagination RPC was invented for this pass", () => {
    expect(archivePageSource).toMatch(/supabase\.rpc\("get_public_archive_goals"\)/);
  });
});

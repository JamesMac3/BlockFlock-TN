import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import source from "../../../components/records-request-goals/RequestDeliveryPanel.jsx?raw";

/**
 * This project has no React component-render test harness (no jsdom), so
 * RequestDeliveryPanel's actual useEffect cannot be mounted directly.
 * Instead:
 *   1. A shape assertion confirms the real component source implements the
 *      create-in-effect / revoke-in-matching-cleanup pattern, keyed off
 *      generated.blob (not a URL string handed down by a parent), and that
 *      creation is deferred via setTimeout (required by this repo's
 *      react-hooks/set-state-in-effect rule, and also what makes a
 *      StrictMode throwaway mount's cleanup able to cancel creation before
 *      it ever happens).
 *   2. A behavioral simulation reproduces exactly that effect's callback
 *      logic (copied here, not imported, since it's defined inline in the
 *      component) against real setTimeout timing (via vi.useFakeTimers()),
 *      driven through React's real setup -> cleanup -> setup -> cleanup
 *      sequence — which is what StrictMode's development double-invoke and
 *      a final unmount actually do — proving no URL is ever revoked while
 *      it's the one currently in use, and every URL that is actually
 *      created is eventually revoked exactly once.
 */

describe("RequestDeliveryPanel source: object URL ownership shape", () => {
  it("creates the object URL from generated.blob, not from a pdfUrl string the caller created", () => {
    expect(source).toMatch(/URL\.createObjectURL\(generated\.blob\)/);
    expect(source).not.toMatch(/generated\.pdfUrl/);
  });

  it("stores the created URL in the panel's own state and revokes exactly that URL in cleanup", () => {
    const effectBody = source.match(/useEffect\(\(\) => \{\s*\n\s*if \(!generated\?\.blob\)[\s\S]*?\n {2}\}, \[generated\?\.blob\]\);/)?.[0] ?? "";
    expect(effectBody).not.toBe("");
    expect(effectBody).toMatch(/url = URL\.createObjectURL\(generated\.blob\);/);
    expect(effectBody).toMatch(/setObjectUrl\(url\);/);
    expect(effectBody).toMatch(/if \(url\) URL\.revokeObjectURL\(url\);/);
  });

  it("defers creation via setTimeout so a StrictMode throwaway mount's cleanup can cancel it before any URL is ever created", () => {
    const effectBody = source.match(/useEffect\(\(\) => \{\s*\n\s*if \(!generated\?\.blob\)[\s\S]*?\n {2}\}, \[generated\?\.blob\]\);/)?.[0] ?? "";
    expect(effectBody).toMatch(/const timer = setTimeout\(\(\) => \{/);
    expect(effectBody).toMatch(/clearTimeout\(timer\);/);
  });

  it("the iframe, Open, and Download controls all read from objectUrl state, never generated.pdfUrl", () => {
    expect(source).toMatch(/src=\{objectUrl\}/);
    expect(source.match(/objectUrl \? \{ href: objectUrl \} : \{\}/g)?.length).toBe(2);
  });

  it("Open/Download are marked disabled while no URL exists yet", () => {
    expect(source.match(/aria-disabled=\{!objectUrl\}/g)?.length).toBe(2);
  });
});

type FakeBlob = { type: string; label?: string };
type EffectDeps = {
  createObjectURL: (blob: FakeBlob) => string;
  revokeObjectURL: (url: string) => void;
  setObjectUrl: (url: string | null) => void;
};

// A faithful copy of the component's own effect callback — not the
// component itself (no render harness available), but the exact same
// deferred create/store/revoke logic asserted against above. Returns the
// cleanup function React would run, exactly as the real effect does.
function runObjectUrlEffect(blob: FakeBlob | null, { createObjectURL, revokeObjectURL, setObjectUrl }: EffectDeps) {
  if (!blob) {
    const timer = setTimeout(() => setObjectUrl(null), 0);
    return () => clearTimeout(timer);
  }
  let url: string | undefined;
  const timer = setTimeout(() => {
    url = createObjectURL(blob);
    setObjectUrl(url);
  }, 0);
  return () => {
    clearTimeout(timer);
    if (url) revokeObjectURL(url);
  };
}

function fakeBlobUrls() {
  let counter = 0;
  const created: Array<{ url: string; blob: FakeBlob }> = [];
  const revoked: string[] = [];
  return {
    created,
    revoked,
    createObjectURL: vi.fn((blob: FakeBlob) => {
      counter += 1;
      const url = `blob:fake-${counter}`;
      created.push({ url, blob });
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revoked.push(url);
    }),
  };
}

describe("Object URL lifecycle behavior: React StrictMode setup-cleanup-setup, and final unmount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("StrictMode's synchronous throwaway mount+cleanup (before any timer fires) never creates a URL at all — only the real second mount does", () => {
    const { createObjectURL, revokeObjectURL, created, revoked } = fakeBlobUrls();
    const setObjectUrl = vi.fn();
    const blob = { type: "application/pdf" };

    // First setup (StrictMode's throwaway mount) — its 0ms timer is
    // scheduled but has not fired yet.
    const cleanup1 = runObjectUrlEffect(blob, { createObjectURL, revokeObjectURL, setObjectUrl });
    expect(createObjectURL).not.toHaveBeenCalled();

    // StrictMode's synchronous cleanup happens immediately, in the same
    // tick — before the timer ever gets a chance to run.
    cleanup1();

    // Second setup (StrictMode's real mount) — this one is never cleared.
    const cleanup2 = runObjectUrlEffect(blob, { createObjectURL, revokeObjectURL, setObjectUrl });

    // Now let the surviving timer actually fire.
    vi.runAllTimers();

    expect(created).toHaveLength(1);
    const urlB = created[0].url;
    expect(setObjectUrl).toHaveBeenLastCalledWith(urlB);
    // Nothing was ever revoked — the throwaway mount never created
    // anything to revoke in the first place.
    expect(revoked).toEqual([]);

    // Final close/unmount revokes exactly the one real URL.
    cleanup2();
    expect(revoked).toEqual([urlB]);
  });

  it("if the first mount's timer does fire before cleanup (no double-invoke this time), its URL is revoked and the second mount creates a fresh one", () => {
    const { createObjectURL, revokeObjectURL, created, revoked } = fakeBlobUrls();
    const setObjectUrl = vi.fn();
    const blob = { type: "application/pdf" };

    const cleanup1 = runObjectUrlEffect(blob, { createObjectURL, revokeObjectURL, setObjectUrl });
    vi.runAllTimers();
    const urlA = created[0].url;
    expect(setObjectUrl).toHaveBeenLastCalledWith(urlA);

    cleanup1();
    expect(revoked).toEqual([urlA]);

    const cleanup2 = runObjectUrlEffect(blob, { createObjectURL, revokeObjectURL, setObjectUrl });
    vi.runAllTimers();
    const urlB = created[1].url;
    expect(urlB).not.toBe(urlA);
    expect(setObjectUrl).toHaveBeenLastCalledWith(urlB);
    // urlB must never have been revoked by the earlier cleanup — Open/Download/iframe are safe to use it now.
    expect(revoked).not.toContain(urlB);

    cleanup2();
    expect(revoked).toEqual([urlA, urlB]);
    expect(new Set(revoked).size).toBe(created.length);
  });

  it("a real blob change (new preview generated) revokes the old URL and creates a new one, never leaking the old one", () => {
    const { createObjectURL, revokeObjectURL, created, revoked } = fakeBlobUrls();
    const setObjectUrl = vi.fn();

    const cleanupFirst = runObjectUrlEffect({ type: "application/pdf", label: "first" }, { createObjectURL, revokeObjectURL, setObjectUrl });
    vi.runAllTimers();
    const firstUrl = created[0].url;

    cleanupFirst();
    const cleanupSecond = runObjectUrlEffect({ type: "application/pdf", label: "second" }, { createObjectURL, revokeObjectURL, setObjectUrl });
    vi.runAllTimers();
    const secondUrl = created[1].url;

    expect(revoked).toEqual([firstUrl]);
    expect(secondUrl).not.toBe(firstUrl);

    cleanupSecond();
    expect(revoked).toEqual([firstUrl, secondUrl]);
  });

  it("no blob (generated not ready yet) sets objectUrl to null and never calls createObjectURL", () => {
    const { createObjectURL, revokeObjectURL } = fakeBlobUrls();
    const setObjectUrl = vi.fn();

    const cleanup = runObjectUrlEffect(null, { createObjectURL, revokeObjectURL, setObjectUrl });
    vi.runAllTimers();

    expect(setObjectUrl).toHaveBeenCalledWith(null);
    expect(createObjectURL).not.toHaveBeenCalled();
    cleanup();
  });
});

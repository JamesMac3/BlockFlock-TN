import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The object-URL create-once/revoke-on-cleanup/StrictMode-safe-deferred
 * pattern this file was written to verify no longer lives in
 * RequestDeliveryPanel.jsx directly — it moved into the shared
 * <PdfPreview> component (src/components/pdf/PdfPreview.jsx) when the
 * mobile PDF preview work replaced RequestDeliveryPanel's own iframe with
 * it. Source-shape assertions for the current architecture (Blob source
 * in, onUrlReady out, RequestDeliveryPanel no longer creating or revoking
 * anything itself) now live in
 * src/features/portal-admin/pdf-preview-shape.test.ts.
 *
 * What remains below is still meaningful on its own: a source-independent
 * behavioral simulation of the exact create/revoke logic pattern (not
 * imported from any component — hand-copied here, matching what
 * PdfPreview.jsx's blob-URL effect implements) against real setTimeout
 * timing (via vi.useFakeTimers()), driven through React's real
 * setup -> cleanup -> setup -> cleanup sequence — which is what
 * StrictMode's development double-invoke and a final unmount actually do —
 * proving no URL is ever revoked while it's the one currently in use, and
 * every URL that is actually created is eventually revoked exactly once.
 */

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

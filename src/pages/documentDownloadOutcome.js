/**
 * Pure decision logic for DocumentPage's Storage-download lifecycle,
 * extracted so the unmount/route-change cancellation behavior can be
 * regression-tested without a React rendering environment.
 *
 * `active` reflects whether the effect that started the download is still
 * the current one (false once the component unmounts or the route/slug
 * changes and a new effect run has superseded this one).
 */
export function resolveDownloadOutcome({ succeeded, active }) {
  if (!succeeded) {
    // A failed/cancelled-before-completion download never creates an
    // object URL, so there is nothing to revoke either way.
    return { updateState: active, revokeUrl: false };
  }

  if (!active) {
    // The download succeeded, but this effect run is stale: the caller
    // already created an object URL from the downloaded Blob and must
    // revoke it immediately instead of adopting it into state.
    return { updateState: false, revokeUrl: true };
  }

  return { updateState: true, revokeUrl: false };
}

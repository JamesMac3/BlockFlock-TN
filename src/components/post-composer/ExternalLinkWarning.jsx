import { useEffect, useRef, useState } from "react";
import { isExternalToCurrentOrigin, validateExternalUrl } from "../../utils/urlValidation";

export default function ExternalLinkWarning({ children }) {
  const [destination, setDestination] = useState(null);
  const originRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!destination) return undefined;
    cancelRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeWarning();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = cancelRef.current?.closest('[role="alertdialog"]');
      const focusable = dialog?.querySelectorAll("button");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [destination]);

  function closeWarning() {
    setDestination(null);
    requestAnimationFrame(() => originRef.current?.focus());
  }

  function handleClick(event) {
    const link = event.target.closest?.("a[href]");
    if (!link || !isExternalToCurrentOrigin(link.href)) return;

    const result = validateExternalUrl(link.href);
    event.preventDefault();
    if (!result.valid) return;
    originRef.current = link;
    setDestination(result);
  }

  function continueToSite() {
    window.open(destination.url, "_blank", "noopener,noreferrer");
    setDestination(null);
  }

  return (
    <div onClickCapture={handleClick}>
      {children}
      {destination && (
        <div className="external-link-warning__backdrop" role="presentation">
          <section
            className="external-link-warning"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="external-link-warning-title"
          >
            <h2 id="external-link-warning-title">You are leaving Flock Block Tennessee</h2>
            <p>This link opens an external website that we do not control.</p>
            <p>Destination: <strong>{destination.hostname}</strong></p>
            <div>
              <button ref={cancelRef} type="button" onClick={closeWarning}>Cancel</button>
              <button type="button" onClick={continueToSite}>Continue to external site</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

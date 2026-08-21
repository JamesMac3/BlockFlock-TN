import { useEffect, useRef } from "react";
import "./AdminPopout.css";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Accessible dark-theme popout used for both the goal-edit and
// chapter-account-edit controls: traps focus while open, closes on Escape
// or the visible Close control, returns focus to the element that opened
// it, and scrolls its own content on small screens rather than the page.
export default function AdminPopout({ title, onClose, children }) {
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? dialog)?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = dialog?.querySelectorAll(FOCUSABLE_SELECTOR);
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the popout's lifetime
  }, []);

  return (
    <div className="admin-popout__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="admin-popout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-popout-title"
        tabIndex={-1}
      >
        <header className="admin-popout__header">
          <h3 id="admin-popout-title">{title}</h3>
          <button type="button" className="admin-popout__close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="admin-popout__body">{children}</div>
      </div>
    </div>
  );
}

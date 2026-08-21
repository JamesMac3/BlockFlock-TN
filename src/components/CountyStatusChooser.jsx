import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import CountySelector from "./CountySelector";
import { setStoredCountySlug } from "../utils/countyPreference";
import "./CountyStatusChooser.css";

export default function CountyStatusChooser({ currentCountySlug }) {
  const [open, setOpen] = useState(false);
  const [counties, setCounties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function loadCounties() {
      const { data, error } = await supabase
        .from("counties")
        .select("id, name, slug, cities")
        .order("name");

      if (!active) return;
      if (error) {
        console.error("County selector request failed:", error);
        setFailed(true);
      } else {
        setCounties(data ?? []);
      }
      setLoading(false);
    }

    loadCounties();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handlePointerDown(event) {
      if (
        !dialogRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        closeChooser(true);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closeChooser(returnFocus) {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleDialogKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeChooser(true);
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), a[href]'
    );
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

  function handleCountySelect(county) {
    setStoredCountySlug(county.slug);

    if (county.slug === currentCountySlug) {
      closeChooser(true);
      return;
    }

    closeChooser(false);
    navigate(`/status/${county.slug}`);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  return (
    <div className="county-status-chooser">
      <button
        ref={triggerRef}
        className="county-status-header__choose"
        type="button"
        aria-expanded={open}
        aria-controls="county-status-chooser-dialog"
        onClick={() => setOpen((current) => !current)}
      >
        Choose another county
      </button>

      {open && (
        <div
          ref={dialogRef}
          id="county-status-chooser-dialog"
          className="county-status-chooser__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="county-status-chooser-title"
          onKeyDown={handleDialogKeyDown}
        >
          <div className="county-status-chooser__heading">
            <h2 id="county-status-chooser-title">Choose a county</h2>
            <button
              type="button"
              aria-label="Close county selector"
              onClick={() => closeChooser(true)}
            >
              ×
            </button>
          </div>
          {loading ? (
            <p role="status">Loading counties...</p>
          ) : failed ? (
            <p role="alert">Counties could not be loaded right now.</p>
          ) : (
            <CountySelector
              counties={counties}
              currentCountySlug={currentCountySlug}
              onSelect={handleCountySelect}
              autoFocus
            />
          )}
        </div>
      )}
    </div>
  );
}

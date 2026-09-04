import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import "./Turnstile.css";

// Cloudflare's explicit-rendering flow: the script is loaded exactly once
// per page (shared across every widget instance via this module-level
// promise), then each mounted <Turnstile> calls window.turnstile.render()
// on its own container and keeps its own widget ID. This is the only
// Turnstile widget implementation in the app — every screen that needs
// bot protection renders an instance of this component with its own
// `action`, never a separate ad-hoc script/widget.
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

let scriptLoadPromise = null;

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window."));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile));
      existing.addEventListener("error", () => reject(new Error("Turnstile script failed to load.")));
      return;
    }
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(window.turnstile));
    script.addEventListener("error", () => reject(new Error("Turnstile script failed to load.")));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

// action is required and must be one of the app's two explicit values —
// callers never invent a third. onToken(token) fires with the token string
// on success, and with null whenever the token stops being usable
// (expiration or a widget error) so the parent can disable its submit
// button again. A ref exposes reset() so the parent can invalidate the
// single-use token after a failed request or a completed newsletter
// submission, per Cloudflare's guidance for explicit widgets.
const Turnstile = forwardRef(function Turnstile({ action, onToken }, ref) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [loadError, setLoadError] = useState("");

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }), []);

  useEffect(() => {
    let cancelled = false;

    if (!SITE_KEY) {
      // Fails closed: with no site key, no widget renders and no token is
      // ever produced, so protected submit buttons stay disabled rather
      // than silently skipping verification.
      console.error("VITE_TURNSTILE_SITE_KEY is not configured.");
      setLoadError("Verification is not available right now.");
      return undefined;
    }

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          action,
          theme: "auto",
          size: "flexible",
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => {
            onToken(null);
            setLoadError("Verification could not be completed. Please try again.");
          },
        });
      })
      .catch((error) => {
        console.error("Turnstile script load failed:", error);
        if (!cancelled) setLoadError("Verification could not be loaded. Please refresh and try again.");
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- renders once per mount; action/onToken are fixed for the lifetime of a given screen's widget
  }, []);

  return (
    <div className="turnstile-widget">
      <div ref={containerRef} />
      {loadError && <p role="alert" className="turnstile-widget__error">{loadError}</p>}
    </div>
  );
});

export default Turnstile;

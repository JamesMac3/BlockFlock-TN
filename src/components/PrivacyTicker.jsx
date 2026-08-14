import { useEffect, useRef, useState } from "react";
import { shouldCollapsePrivacyTicker } from "../utils/privacyTickerState";
import "./PrivacyTicker.css";

export const PRIVACY_WARNING = "PRIVACY WARNING — Use a reputable VPN when traveling the web to reduce passive network data collection. They already have enough.";

export default function PrivacyTicker() {
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const frameRef = useRef(null);

  useEffect(() => {
    function updateFromScroll() {
      frameRef.current = null;
      const nextCollapsed = shouldCollapsePrivacyTicker(collapsedRef.current, window.scrollY);
      if (nextCollapsed === collapsedRef.current) return;
      collapsedRef.current = nextCollapsed;
      setCollapsed(nextCollapsed);
    }

    function handleScroll() {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(updateFromScroll);
    }

    updateFromScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <aside className={`privacy-ticker ${collapsed ? "is-collapsed" : ""}`} aria-label="Privacy warning">
      <p className="sr-only">{PRIVACY_WARNING}</p>
      <div className="privacy-ticker__viewport" aria-hidden="true">
        <div className="privacy-ticker__track">
          <TickerMessage />
          <TickerMessage />
        </div>
      </div>
    </aside>
  );
}

function TickerMessage() {
  return <span className="privacy-ticker__message"><strong>PRIVACY WARNING</strong><span>Use a reputable VPN when traveling the web to reduce passive network data collection. They already have enough.</span></span>;
}

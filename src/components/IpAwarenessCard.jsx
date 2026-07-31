import { useEffect, useState } from "react";
import "./IpAwarenessCard.css";

export default function IpAwarenessCard() {
  const [displayState, setDisplayState] = useState("waiting");

  useEffect(() => {
    const showTimer = window.setTimeout(() => {
      setDisplayState((current) =>
        current === "waiting" ? "visible" : current
      );
    }, 10000);

    return () => {
      window.clearTimeout(showTimer);
    };
  }, []);

  useEffect(() => {
    if (displayState !== "fading") return undefined;

    const hideTimer = window.setTimeout(() => setDisplayState("hidden"), 300);
    return () => window.clearTimeout(hideTimer);
  }, [displayState]);

  function dismiss() {
    setDisplayState((current) =>
      current === "visible" ? "fading" : current
    );
  }

  if (displayState === "waiting" || displayState === "hidden") return null;

  return (
    <aside
      className={`ip-awareness-card ${displayState === "fading" ? "is-fading" : ""}`}
      role="status"
      aria-labelledby="ip-awareness-title"
      onMouseEnter={dismiss}
    >
      <button
        type="button"
        className="ip-awareness-card__close"
        onClick={dismiss}
        aria-label="Dismiss IP address warning"
      >
        ×
      </button>
      <h2 id="ip-awareness-title">Your IP address is visible</h2>
      <p>
        Websites and infrastructure providers can see your public IP address when
        you connect.
      </p>
      <p className="ip-awareness-card__address">
        Your current public IP is{" "}
        <strong>
          203.0.113.42 <em>(NOT YOUR REAL IP)</em>
        </strong>
      </p>
      <p>
        If participation could create personal or professional risk, connect
        through a trusted VPN or Tor before submitting organizing information. A
        VPN reduces direct IP exposure but does not guarantee anonymity.
      </p>
      <p>
        Flock Block Tennessee displays this address for your awareness and does
        not record it. Hosting providers may retain connection logs under their
        own policies because they own hardware and services Flock Block operates
        on.
      </p>
    </aside>
  );
}

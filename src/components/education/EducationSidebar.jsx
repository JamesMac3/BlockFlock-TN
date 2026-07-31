import { useEffect, useState } from "react";

export default function EducationSidebar() {
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia("(max-width: 768px)").matches
  );
  const [isOpen, setIsOpen] = useState(false);
  const isVisible = !isMobile || isOpen;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const handleChange = (event) => setIsMobile(event.matches);

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  function handleNavigation(event) {
    if (isMobile && event.target.closest("a")) {
      setIsOpen(false);
    }
  }

  return (
    <aside
      className={`education-sidebar ${isOpen ? "is-open" : "is-closed"}`}
      aria-label="Education topics"
    >
      <button
        type="button"
        className="education-sidebar-toggle"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={isOpen ? "Close education topics" : "Open education topics"}
        aria-expanded={isOpen}
      >
        <svg
          className={`education-sidebar-toggle-arrow ${isOpen ? "is-open" : ""}`}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M9 5l7 7-7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="education-sidebar-content">
<div className="sidebar-header">
    <span className="sidebar-label">EDUCATION</span>

    <h3>Documentation</h3>

    <input
        type="text"
        placeholder="Search topics..."
        className="sidebar-search"
        tabIndex={isVisible ? 0 : -1}
    />
</div>
      <h3>Education</h3>

      <nav className="education-nav" onClick={handleNavigation}>

        <details open>

          <summary tabIndex={isVisible ? 0 : -1}>Vendors</summary>

          <ul>

            <li>
              <a href="#flock" tabIndex={isVisible ? 0 : -1}>Flock Safety</a>
            </li>

            <li>
              <a href="#motorola" tabIndex={isVisible ? 0 : -1}>Motorola Solutions</a>
            </li>

            <li>
              <a href="#leonardo" tabIndex={isVisible ? 0 : -1}>Leonardo</a>
            </li>

          </ul>

        </details>

        <details>

          <summary tabIndex={isVisible ? 0 : -1}>Oversight Issues</summary>

          <ul>

            <li>
              <a href="#procurement" tabIndex={isVisible ? 0 : -1}>Procurement</a>
            </li>

            <li>
              <a href="#auditing" tabIndex={isVisible ? 0 : -1}>Auditing</a>
            </li>

            <li>
              <a href="#data-sharing" tabIndex={isVisible ? 0 : -1}>Data Sharing</a>
            </li>

          </ul>

        </details>

        <details>

          <summary tabIndex={isVisible ? 0 : -1}>Data Fusion</summary>

          <ul>

            <li>
              <a href="#rtcc" tabIndex={isVisible ? 0 : -1}>RTCC</a>
            </li>

            <li>
              <a href="#signal-trace" tabIndex={isVisible ? 0 : -1}>Signal Trace</a>
            </li>

            <li>
              <a href="#pattern-of-life" tabIndex={isVisible ? 0 : -1}>Pattern of Life</a>
            </li>

          </ul>

        </details>

        <details>

          <summary tabIndex={isVisible ? 0 : -1}>Dangers of Indiscriminate Surveillance</summary>

          <ul>

            <li>
              <a href="#function-creep" tabIndex={isVisible ? 0 : -1}>Function Creep</a>
            </li>

            <li>
              <a href="#privacy" tabIndex={isVisible ? 0 : -1}>Privacy</a>
            </li>

          </ul>

        </details>

      </nav>
      </div>
    </aside>
  );
}

import { useEffect, useMemo, useState } from "react";
import { getGroupedEducationTopics } from "../../data/education/registry";

export default function EducationSidebar({ activeSlug, onSelect }) {
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia("(max-width: 768px)").matches
  );
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isVisible = !isMobile || isOpen;
  const groups = useMemo(() => getGroupedEducationTopics(), []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const handleChange = (event) => setIsMobile(event.matches);

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = normalizedQuery
    ? groups
        .map((group) => ({
          ...group,
          topics: group.topics.filter((topic) =>
            topic.navLabel.toLowerCase().includes(normalizedQuery)
          ),
        }))
        .filter((group) => group.topics.length > 0)
    : groups;

  function handleSelect(event, slug) {
    event.preventDefault();
    onSelect(slug);
    if (isMobile) {
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

          <h3>Topics</h3>

          <input
            type="text"
            placeholder="Search topics..."
            className="sidebar-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            tabIndex={isVisible ? 0 : -1}
          />
        </div>

        <nav className="education-nav" aria-label="Interactive education modules">
          {visibleGroups.map((group) => (
            <details key={group.name} open>
              <summary tabIndex={isVisible ? 0 : -1}>{group.name}</summary>

              <ul>
                {group.topics.map((topic) => (
                  <li key={topic.slug}>
                    <a
                      href={`#${topic.slug}`}
                      className={topic.slug === activeSlug ? "active" : ""}
                      aria-current={topic.slug === activeSlug ? "page" : undefined}
                      tabIndex={isVisible ? 0 : -1}
                      onClick={(event) => handleSelect(event, topic.slug)}
                    >
                      {topic.navLabel}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ))}

          {visibleGroups.length === 0 && (
            <p className="education-nav-empty">No topics match “{query}”.</p>
          )}
        </nav>
      </div>
    </aside>
  );
}

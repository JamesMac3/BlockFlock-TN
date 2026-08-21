import "./TabNav.css";

// Shared white-outline dark tab navigation: used for the administrator
// workspace tabs, the chapter-master portal-section tabs, and the Goal
// Management subtabs. Only the active tab's content should be mounted by
// the caller — this component only renders the tab strip itself.
export default function TabNav({ items, activeId, onSelect, label }) {
  return (
    <nav className="tab-nav" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`tab-nav__item ${activeId === item.id ? "is-active" : ""}`}
          aria-pressed={activeId === item.id}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

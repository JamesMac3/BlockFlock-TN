import "./ChapterLinkButton.css";

// Polymorphic so the exact same markup/CSS classes back both the real,
// navigable public button (`as="a"`) and the portal editor's live preview,
// which must never itself be a working link while the URL is still being
// typed/validated (`as="span"`).
export default function ChapterLinkButton({ label, color, url, as = "a" }) {
  const className = `chapter-link-button chapter-link-button--${color}`;

  if (as === "a") {
    return (
      <a className={className} href={url} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  }

  return <span className={className}>{label}</span>;
}

export default function TopicPager({ previous, next, onSelect }) {
  if (!previous && !next) return null;

  function handleClick(event, slug) {
    event.preventDefault();
    onSelect(slug);
  }

  return (
    <nav className="topic-pager" aria-label="Topic navigation">
      {previous ? (
        <a
          className="topic-pager__link topic-pager__link--previous"
          href={`#${previous.slug}`}
          onClick={(event) => handleClick(event, previous.slug)}
        >
          <span aria-hidden="true">&larr;</span>
          <span className="topic-pager__text">
            <small>Previous Topic</small>
            <strong>{previous.navLabel}</strong>
          </span>
        </a>
      ) : (
        <span className="topic-pager__spacer" />
      )}

      {next ? (
        <a
          className="topic-pager__link topic-pager__link--next"
          href={`#${next.slug}`}
          onClick={(event) => handleClick(event, next.slug)}
        >
          <span className="topic-pager__text">
            <small>Next Topic</small>
            <strong>{next.navLabel}</strong>
          </span>
          <span aria-hidden="true">&rarr;</span>
        </a>
      ) : (
        <span className="topic-pager__spacer" />
      )}
    </nav>
  );
}

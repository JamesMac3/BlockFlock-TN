import { Link } from "react-router-dom";

export default function TopicPager({ previous, next }) {
  if (!previous && !next) return null;

  return (
    <nav className="topic-pager" aria-label="Topic navigation">
      {previous ? (
        <Link
          className="topic-pager__link topic-pager__link--previous"
          to={`/education/${previous.slug}`}
        >
          <span aria-hidden="true">&larr;</span>
          <span className="topic-pager__text">
            <small>Previous Topic</small>
            <strong>{previous.navLabel}</strong>
          </span>
        </Link>
      ) : (
        <span className="topic-pager__spacer" />
      )}

      {next ? (
        <Link
          className="topic-pager__link topic-pager__link--next"
          to={`/education/${next.slug}`}
        >
          <span className="topic-pager__text">
            <small>Next Topic</small>
            <strong>{next.navLabel}</strong>
          </span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      ) : (
        <span className="topic-pager__spacer" />
      )}
    </nav>
  );
}

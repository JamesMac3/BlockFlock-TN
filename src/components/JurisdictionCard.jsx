import { Link } from "react-router-dom";

const statusLabels = {
  active: "Active",
  investigating: "Under investigation",
  organising: "Organising",
  unknown: "Status incomplete",
};

export default function JurisdictionCard({
  name,
  county,
  status = "unknown",
  summary,
  href = "/status",
}) {
  return (
    <article className="jurisdiction-card">
      <div className="jurisdiction-card__header">
        <div>
          <p>{county}</p>
          <h3>{name}</h3>
        </div>

        <span className={`status-badge status-badge--${status}`}>
          {statusLabels[status] ?? status}
        </span>
      </div>

      <p className="jurisdiction-card__summary">{summary}</p>

      <Link to={href} className="text-link">
        View jurisdiction
        <span aria-hidden="true"> →</span>
      </Link>
    </article>
  );
}
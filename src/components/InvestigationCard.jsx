import { Link } from "react-router-dom";

export default function InvestigationCard({
  number,
  title,
  description,
  buttonLabel,
  to,
}) {
  return (
    <article className="investigation-card">
      <span className="investigation-card__number">{number}</span>

      <h3>{title}</h3>
      <p>{description}</p>

      <Link to={to} className="button button--secondary-dark investigation-card__button">
        {buttonLabel}
      </Link>
    </article>
  );
}

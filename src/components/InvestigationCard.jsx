export default function InvestigationCard({
  number,
  title,
  description,
  topics = [],
}) {
  return (
    <article className="investigation-card">
      <span className="investigation-card__number">{number}</span>

      <h3>{title}</h3>
      <p>{description}</p>

      <ul className="tag-list" aria-label={`${title} topics`}>
        {topics.map((topic) => (
          <li key={topic}>{topic}</li>
        ))}
      </ul>
    </article>
  );
}
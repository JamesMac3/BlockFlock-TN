import { Link } from "react-router-dom";
import "./EducationEntryCards.css";

const CATEGORIES = [
  {
    key: "handouts",
    label: "Handouts",
    description: "Printable one-pagers for tabling, canvassing, and council meetings.",
  },
  {
    key: "presentations",
    label: "Presentations",
    description: "Slide decks for chapter meetings, community talks, and briefings.",
    resources: [
      {
        label: "6 Points About Surveillance",
        href: "/documents/6-points-about-surveillance",
      },
    ],
  },
  {
    key: "other",
    label: "Other",
    description: "Additional distributable materials that don't fit the categories above.",
  },
];

export default function EducationEntryCards() {
  return (
    <section className="education-entry-cards" aria-label="Distributable education materials">
      <div className="education-entry-cards__grid">
        {CATEGORIES.map((category) => (
          <article key={category.key} className="education-entry-card">
            <h3>{category.label}</h3>
            <p>{category.description}</p>
            {category.resources?.length ? (
              <ul className="education-entry-card__resources">
                {category.resources.map((resource) => (
                  <li key={resource.href}>
                    <Link to={resource.href}>{resource.label}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="education-entry-card__empty">Coming soon</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

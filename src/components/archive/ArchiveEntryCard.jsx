import "./ArchiveEntryCard.css";

const PROFILE_FAMILY_LABELS = {
  municipal_form: "Municipal form",
  municipal_letter: "Municipal letter",
  tennessee_model: "Tennessee model request",
};

const RENDERER_NOTES = {
  generated_letter:
    "This jurisdiction's request document is generated at request time rather than provided as a static file.",
};

export default function ArchiveEntryCard({ profile, entity, downloadUrl }) {
  const jurisdictionName = entity.display_name || entity.legal_name;
  const title = `${jurisdictionName} Request Template`;
  const categoryLabel = PROFILE_FAMILY_LABELS[profile.template_family] || "Request template";

  return (
    <article className="archive-entry-card">
      <div className="archive-entry-card__header">
        <h3 className="archive-entry-card__title">{title}</h3>
        <span className="archive-entry-card__category">{categoryLabel}</span>
      </div>

      <p className="archive-entry-card__jurisdiction">{jurisdictionName}</p>

      {profile.policy_summary && (
        <p className="archive-entry-card__summary">{profile.policy_summary}</p>
      )}

      <div className="archive-entry-card__action">
        {downloadUrl ? (
          <a
            href={downloadUrl}
            className="archive-entry-card__download"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download Template
          </a>
        ) : (
          <p className="archive-entry-card__notice">
            {RENDERER_NOTES[profile.renderer_type] ||
              "This template file is not yet publicly available."}
          </p>
        )}
      </div>
    </article>
  );
}

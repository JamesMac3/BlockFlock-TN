import { useId, useState } from "react";
import { getChapterContactEmail } from "../../utils/chapterContactEmail";
import "./HaveRecordsCard.css";

export default function HaveRecordsCard({ county }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const email = getChapterContactEmail(county);

  return (
    <div className="have-records">
      <button
        type="button"
        className="have-records__toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
      >
        Have records?
        <span className="have-records__toggle-icon" aria-hidden="true">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded && (
        <div id={panelId} className="have-records__card" role="region" aria-label="Send records to your local chapter">
          <h3>Have records to share?</h3>
          <p>Send contracts, records responses, rejection letters, and supporting documents to:</p>

          <p className="have-records__email">
            <a href={`mailto:${email}`}>{email}</a>
          </p>

          <a href={`mailto:${email}`} className="have-records__mailto-btn">
            Email records
          </a>

          <p className="have-records__note">
            Keep attachments under 20 MB total per email. For larger collections, send multiple
            emails. Split any individual file larger than 20 MB into smaller parts before sending.
          </p>
        </div>
      )}
    </div>
  );
}

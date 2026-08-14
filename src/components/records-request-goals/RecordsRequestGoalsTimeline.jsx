import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { getIntegrationStatus } from "../../features/document-request/documentFiller.js";

const statusMessages = {
  draft: "This goal is in draft and not yet public",
  profile_needed: "A verified request profile is needed for this goal",
  ready: "Ready to prepare a records request",
  requested: "Request has been submitted",
  received: "Records have been received",
  published: "Records have been published",
  unavailable: "This goal is temporarily unavailable",
  retired: "This goal has been retired",
};

const statusLabels = {
  draft: "Draft",
  profile_needed: "Profile Needed",
  ready: "Ready",
  requested: "Requested",
  received: "Received",
  published: "Published",
  unavailable: "Unavailable",
  retired: "Retired",
};

export default function RecordsRequestGoalsTimeline({ goals, county }) {
  if (!goals || goals.length === 0) {
    return null;
  }

  return (
    <div className="records-goals-timeline">
      {goals.map((goal, index) => (
        <TimelineEntry key={goal.id} goal={goal} index={index} isLast={index === goals.length - 1} />
      ))}
    </div>
  );
}

function TimelineEntry({ goal, index, isLast }) {
  const statusLabel = statusLabels[goal.status] || goal.status;
  const links = goal.records_request_goal_links || [];
  const [verifiedProfiles, setVerifiedProfiles] = useState([]);
  const [hostedEvidenceUrl, setHostedEvidenceUrl] = useState(null);

  // Sort links by position and mark primary
  const sortedLinks = [...links].sort((a, b) => a.position - b.position);
  const primaryLink = sortedLinks.find((l) => l.is_primary);

  // Load verified profiles matching this goal's entity
  useEffect(() => {
    async function loadProfiles() {
      if (goal.status !== "ready" || !goal.government_entity_id) return;

      try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from("request_profiles")
          .select("id, version, government_entity_id")
          .eq("government_entity_id", goal.government_entity_id)
          .eq("status", "verified")
          .lte("effective_from", now)
          .or(`effective_to.is.null,effective_to.gte.${now}`);

        if (!error && data) {
          setVerifiedProfiles(data);
        }
      } catch (err) {
        console.error("Failed to load verified profiles:", err);
      }
    }

    loadProfiles();
  }, [goal.status, goal.government_entity_id]);

  // Resolve hosted evidence URL if available
  useEffect(() => {
    async function resolveEvidenceUrl() {
      if (!primaryLink?.evidence_object_id) return;

      try {
        const { data, error } = await supabase
          .from("evidence_objects")
          .select("id, visibility, status, storage_bucket, storage_path")
          .eq("id", primaryLink.evidence_object_id)
          .eq("status", "published")
          .eq("visibility", "public")
          .maybeSingle();

        if (!error && data && data.storage_path && data.storage_bucket) {
          // Get public URL from storage
          const { data: urlData } = supabase.storage
            .from(data.storage_bucket)
            .getPublicUrl(data.storage_path);
          if (urlData?.publicUrl) {
            setHostedEvidenceUrl(urlData.publicUrl);
          }
        }
      } catch (err) {
        console.error("Failed to resolve evidence URL:", err);
      }
    }

    resolveEvidenceUrl();
  }, [primaryLink]);

  const pdfStatus = getIntegrationStatus();
  const canPrepareRequest = goal.status === "ready" && verifiedProfiles.length > 0;
  const hasHostedEvidence = !!hostedEvidenceUrl;

  return (
    <div className="timeline-entry">
      <div className="timeline-marker">
        <div className="timeline-dot"></div>
        {!isLast && <div className="timeline-line"></div>}
      </div>

      <div className="timeline-content">
        <div className="timeline-header">
          <h3>{goal.title}</h3>
          <span className={`timeline-status timeline-status--${goal.status}`}>
            {statusLabel}
          </span>
        </div>

        {goal.public_summary && (
          <p className="timeline-summary">{goal.public_summary}</p>
        )}

        <div className="timeline-actions">
          {goal.status === "ready" && (
            <>
              {canPrepareRequest ? (
                <button
                  type="button"
                  className="timeline-action-btn"
                  disabled={pdfStatus.isImplemented === false}
                  title={pdfStatus.isImplemented === false ? pdfStatus.message : "Prepare a records request"}
                >
                  Prepare Request Form
                </button>
              ) : (
                <button
                  type="button"
                  className="timeline-action-btn"
                  disabled
                  title="A verified request profile is needed for this entity"
                >
                  Prepare Request Form
                </button>
              )}
            </>
          )}

          {hasHostedEvidence && (
            <a href={hostedEvidenceUrl} className="timeline-action-btn timeline-action-link" target="_blank" rel="noopener noreferrer">
              View Hosted Document
            </a>
          )}

          {primaryLink && primaryLink.external_url && (
            <a
              href={primaryLink.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="timeline-action-btn timeline-action-link"
            >
              View External Document
            </a>
          )}

          {goal.status === "profile_needed" && (
            <p className="timeline-notice">
              A verified request profile is needed before you can prepare a form.
            </p>
          )}

          {goal.status === "unavailable" && (
            <p className="timeline-notice">
              This goal is temporarily unavailable.
            </p>
          )}
        </div>

        {sortedLinks.length > 1 && (
          <div className="timeline-links">
            <details className="timeline-links-details">
              <summary>View all {sortedLinks.length} resources</summary>
              <ul className="timeline-links-list">
                {sortedLinks.map((link) => (
                  <li key={link.id}>
                    {link.external_url ? (
                      <a
                        href={link.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label}
                      </a>
                    ) : link.evidence_object_id ? (
                      <span title="Hosted evidence is not publicly accessible yet">{link.label}</span>
                    ) : (
                      <span>{link.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

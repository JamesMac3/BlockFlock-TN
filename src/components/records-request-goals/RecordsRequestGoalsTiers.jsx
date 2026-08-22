import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import RequestDeliveryPanel from "./RequestDeliveryPanel";
import OperatorDraftPreviewButton from "./OperatorDraftPreviewButton";
import "./RecordsRequestGoalsTiers.css";

const TIER_ORDER = [1, 2, 3, 4];
const TIER_LABELS = {
  1: "Tier 1",
  2: "Tier 2",
  3: "Tier 3",
  4: "Tier 4",
};

const PROFILE_FAMILY_LABELS = {
  municipal_form: "Municipal form",
  municipal_letter: "Municipal letter",
  tennessee_model: "Tennessee model request",
};

const PROFILE_ROW_COLUMNS =
  "id, government_entity_id, version, schema_version, status, effective_from, effective_to, " +
  "policy_source_url, archived_policy_object_id, policy_summary, eligibility_mode, eligibility_jurisdiction, " +
  "eligibility_explanation, form_mode, form_explanation, fee_rule, aggregation_rule, submission_instructions, " +
  "template_family, renderer_type, base_pdf_object_id, continuation_profile_id, field_schema, template_schema, " +
  "validation_schema, output_options, verified_by, verified_at";

const ENTITY_ROW_COLUMNS =
  "id, legal_name, display_name, coordinator_name, coordinator_title, submission_email, mailing_address, portal_url";

// A goal only needs a readiness check once it clears the cheap local
// checks. Locked goals or goals with no profile/records description never
// reach Supabase for a profile/entity lookup.
function isReadinessCandidate(goal) {
  return !goal.locked && Boolean(goal.request_profile_id) && Boolean(goal.fill_payload?.request?.records_description);
}

export default function RecordsRequestGoalsTiers({ goals, county }) {
  const [profilesById, setProfilesById] = useState({});
  const [readinessByGoalId, setReadinessByGoalId] = useState({});
  const [delivery, setDelivery] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadProfileSummaries() {
      const profileIds = [
        ...new Set(goals.map((goal) => goal.request_profile_id).filter(Boolean)),
      ];

      if (profileIds.length === 0) {
        setProfilesById({});
        return;
      }

      const { data, error } = await supabase
        .from("request_profiles")
        .select("id, version, template_family, status")
        .in("id", profileIds);

      if (!active) return;

      if (error) {
        console.error("Failed to load request profiles:", error);
        setProfilesById({});
        return;
      }

      setProfilesById(Object.fromEntries((data ?? []).map((profile) => [profile.id, profile])));
    }

    loadProfileSummaries();
    return () => {
      active = false;
    };
  }, [goals]);

  useEffect(() => {
    let active = true;

    async function evaluateReadiness() {
      const candidateGoals = goals.filter(isReadinessCandidate);

      if (candidateGoals.length === 0) {
        setReadinessByGoalId({});
        return;
      }

      setReadinessByGoalId(
        Object.fromEntries(candidateGoals.map((goal) => [goal.id, { status: "checking" }]))
      );

      const profileIds = [...new Set(candidateGoals.map((goal) => goal.request_profile_id))];
      const entityIds = [
        ...new Set(candidateGoals.map((goal) => goal.government_entity_id).filter((id) => id !== null && id !== undefined)),
      ];

      const [profilesResult, entitiesResult] = await Promise.all([
        supabase.from("request_profiles").select(PROFILE_ROW_COLUMNS).in("id", profileIds),
        entityIds.length > 0
          ? supabase.from("government_entities").select(ENTITY_ROW_COLUMNS).in("id", entityIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!active) return;

      if (profilesResult.error) console.error("Failed to load request profile rows:", profilesResult.error);
      if (entitiesResult.error) console.error("Failed to load government entity rows:", entitiesResult.error);

      const profileRowById = Object.fromEntries((profilesResult.data ?? []).map((row) => [row.id, row]));
      const entityRowById = Object.fromEntries((entitiesResult.data ?? []).map((row) => [row.id, row]));

      const { evaluateGoalReadiness } = await import("../../features/document-request/pdf/readiness");

      if (!active) return;

      // Evaluated one goal at a time so a single malformed row cannot abort
      // the whole batch (which would otherwise leave every card stuck on
      // "Checking…" forever) — a failure here is a data problem to report
      // truthfully, not a reason to lose the rest of the batch's results.
      const results = {};
      for (const goal of candidateGoals) {
        const profileRow = profileRowById[goal.request_profile_id] ?? null;
        const entityRow = entityRowById[goal.government_entity_id] ?? null;
        try {
          results[goal.id] = {
            status: "done",
            result: evaluateGoalReadiness({ goal, profileRow, entityRow }),
          };
        } catch (error) {
          console.error(`Failed to evaluate readiness for goal ${goal.id}:`, error);
          results[goal.id] = {
            status: "done",
            result: {
              ready: false,
              code: "READINESS_CHECK_FAILED",
              message: "This request form is being verified and is not available for download yet.",
            },
          };
        }
      }
      setReadinessByGoalId(results);
    }

    evaluateReadiness();
    return () => {
      active = false;
    };
  }, [goals]);

  if (!goals || goals.length === 0) {
    return null;
  }

  const goalsByTier = new Map(TIER_ORDER.map((tier) => [tier, []]));
  for (const goal of goals) {
    if (goalsByTier.has(goal.tier)) {
      goalsByTier.get(goal.tier).push(goal);
    }
  }

  return (
    <div className="records-goals-tiers">
      {TIER_ORDER.map((tier) => {
        const tierGoals = goalsByTier.get(tier);
        if (!tierGoals || tierGoals.length === 0) return null;

        return (
          <section key={tier} className="goal-tier">
            <h2 className="goal-tier__header">{TIER_LABELS[tier]}</h2>
            <div className="goal-tier__list">
              {tierGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  county={county}
                  profile={goal.request_profile_id ? profilesById[goal.request_profile_id] : null}
                  readiness={readinessByGoalId[goal.id]}
                  onPrepared={(generated, readyResult) =>
                    setDelivery({
                      goal,
                      profile: readyResult.profile,
                      data: readyResult.data,
                      generated,
                      validationWarnings: readyResult.warnings,
                    })
                  }
                />
              ))}
            </div>
          </section>
        );
      })}

      {delivery && county && (
        <RequestDeliveryPanel
          county={county}
          goal={delivery.goal}
          profile={delivery.profile}
          data={delivery.data}
          generated={delivery.generated}
          validationWarnings={delivery.validationWarnings}
          onClose={() => setDelivery(null)}
        />
      )}
    </div>
  );
}

function GoalCard({ goal, county, profile, readiness, onPrepared }) {
  const [generationState, setGenerationState] = useState({ status: "idle" });

  const links = [...(goal.records_request_goal_links || [])].sort(
    (a, b) => a.position - b.position
  );

  const isCandidate = isReadinessCandidate(goal);
  const isReady = readiness?.status === "done" && readiness.result.ready === true;

  async function handlePrepareRequest() {
    if (!isReady) return;

    setGenerationState({ status: "working" });
    try {
      const { generateRequestDocument } = await import(
        "../../features/document-request/pdf/generate-request-document"
      );
      const generated = await generateRequestDocument(readiness.result.profile, readiness.result.data, { supabase });
      // No object URL is created here — RequestDeliveryPanel owns that
      // lifecycle entirely, from generated.blob.
      setGenerationState({ status: "idle" });
      onPrepared(generated, readiness.result);
    } catch (error) {
      console.error("Failed to generate request document:", error);
      setGenerationState({
        status: "error",
        message: "The request document could not be generated. Please try again later.",
      });
    }
  }

  return (
    <article className={`goal-card${goal.locked ? " goal-card--locked" : ""}`}>
      <div className="goal-card__header">
        <h3 className="goal-card__title">{goal.title}</h3>
        {goal.locked && <span className="goal-card__lock-badge">Locked</span>}
      </div>

      {goal.public_summary && <p className="goal-card__purpose">{goal.public_summary}</p>}

      {goal.locked && goal.locked_reason && (
        <p className="goal-card__locked-reason">{goal.locked_reason}</p>
      )}

      {profile && (
        <p className="goal-card__profile-summary">
          Request profile: {PROFILE_FAMILY_LABELS[profile.template_family] || "Request profile"} ·
          version {profile.version}
        </p>
      )}

      {!goal.locked && (
        <div className="goal-card__actions">
          {isReady ? (
            <>
              <button
                type="button"
                className="goal-card__action-btn"
                onClick={handlePrepareRequest}
                disabled={generationState.status === "working"}
              >
                {generationState.status === "working" ? "Preparing…" : "Prepare Request Form"}
              </button>
              {generationState.status === "error" && (
                <p className="goal-card__notice">{generationState.message}</p>
              )}
            </>
          ) : isCandidate ? (
            <p className="goal-card__notice">
              {readiness?.status === "checking" || !readiness
                ? "Checking request-form availability…"
                : readiness.result.message}
            </p>
          ) : (
            <p className="goal-card__notice">
              A request profile and records description are needed before this request can be
              prepared.
            </p>
          )}
        </div>
      )}

      {/* Renders nothing unless a portal session is authenticated for this
          county — the component itself now decides, based on the linked
          profile's live status, whether to offer a draft or verified
          preview, or neither. */}
      <OperatorDraftPreviewButton goal={goal} county={county} />

      {links.length > 0 && (
        <details className="goal-card__links">
          <summary>
            View {links.length} resource{links.length === 1 ? "" : "s"}
          </summary>
          <ul>
            {links.map((link) => (
              <li key={link.id}>
                {link.evidence_object_id ? (
                  <Link to={`/archive/documents/${link.evidence_object_id}`}>{link.label}</Link>
                ) : link.external_url ? (
                  <a href={link.external_url} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                ) : (
                  <span>{link.label}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

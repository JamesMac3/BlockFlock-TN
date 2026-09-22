import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import RequestDeliveryPanel from "./RequestDeliveryPanel";
import RequestPortalDeliveryPanel from "./RequestPortalDeliveryPanel";
import OperatorDraftPreviewButton from "./OperatorDraftPreviewButton";
import RenderFailureDiagnostic from "./RenderFailureDiagnostic";
import { explainRenderFailure, logRenderFailureChain } from "../../features/document-request/pdf/render-failure-explanations";
import { isGoalPubliclyArchived } from "../../features/document-request/publicArchiveEligibility";
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
  online_portal: "Online request portal",
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
// checks. Locked goals or goals with no profile never reach Supabase for a
// profile/entity lookup. An online_portal goal is still a candidate even
// with no goal-level records_description — the profile's own default
// request_text may supply it (rrg_prepare_online_request's text
// precedence), unlike every PDF renderer type, which always needs the
// goal's own records_description present in fill_payload.
function isReadinessCandidate(goal, profilesById) {
  if (goal.locked || !goal.request_profile_id) return false;
  const summary = profilesById[goal.request_profile_id];
  if (summary?.template_family === "online_portal") return true;
  return Boolean(goal.fill_payload?.request?.records_description);
}

export default function RecordsRequestGoalsTiers({ goals, county }) {
  const [profilesById, setProfilesById] = useState({});
  // Distinguishes "we haven't determined this goal's profile type yet"
  // from "we checked, and it genuinely has no usable profile" — without
  // this, a goal card could flash the hard "A request profile and records
  // description are needed" message during the brief window before
  // profilesById's own fetch resolves, instead of "Checking…". See
  // GoalCard's isCandidate/profilesLoaded usage below.
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [readinessByGoalId, setReadinessByGoalId] = useState({});
  const [delivery, setDelivery] = useState(null);
  const [portalDelivery, setPortalDelivery] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadProfileSummaries() {
      setProfilesLoaded(false);

      const profileIds = [
        ...new Set(goals.map((goal) => goal.request_profile_id).filter(Boolean)),
      ];

      if (profileIds.length === 0) {
        setProfilesById({});
        setProfilesLoaded(true);
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
        setProfilesLoaded(true);
        return;
      }

      setProfilesById(Object.fromEntries((data ?? []).map((profile) => [profile.id, profile])));
      setProfilesLoaded(true);
    }

    // Deferred past the effect's own synchronous body (same technique used
    // elsewhere in this codebase, e.g. ChapterMasterManagementTable.jsx's
    // loadCounties) so the initial setProfilesLoaded(false) above never
    // runs as a same-tick cascading render.
    const timer = setTimeout(loadProfileSummaries, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [goals]);

  useEffect(() => {
    let active = true;

    async function evaluateReadiness() {
      const candidateGoals = goals.filter((goal) => isReadinessCandidate(goal, profilesById));

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

      // Online-portal goals are evaluated by a separate, much lighter
      // check (online-portal-readiness.ts) that never touches PDF
      // readiness, template loading, or integrity checking — see that
      // module's own comment. evaluateGoalReadiness (the PDF pipeline) is
      // only imported/called for goals whose profile is a PDF renderer
      // type, never for online_portal.
      const [{ evaluateGoalReadiness }, { evaluateOnlinePortalGoalReadiness }] = await Promise.all([
        import("../../features/document-request/pdf/readiness"),
        import("../../features/document-request/pdf/online-portal-readiness"),
      ]);

      if (!active) return;

      // Evaluated one goal at a time so a single malformed row cannot abort
      // the whole batch (which would otherwise leave every card stuck on
      // "Checking…" forever) — a failure here is a data problem to report
      // truthfully, not a reason to lose the rest of the batch's results.
      const results = {};
      for (const goal of candidateGoals) {
        const profileRow = profileRowById[goal.request_profile_id] ?? null;
        const entityRow = entityRowById[goal.government_entity_id] ?? null;
        const isOnlinePortal = profilesById[goal.request_profile_id]?.template_family === "online_portal";
        try {
          results[goal.id] = {
            status: "done",
            result: isOnlinePortal
              ? evaluateOnlinePortalGoalReadiness({ goal, profileRow, entityRow })
              : evaluateGoalReadiness({ goal, profileRow, entityRow }),
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
  }, [goals, profilesById]);

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
                  profilesLoaded={profilesLoaded}
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
                  onPortalPrepared={(result) => setPortalDelivery(result)}
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

      {portalDelivery && (
        <RequestPortalDeliveryPanel result={portalDelivery} onClose={() => setPortalDelivery(null)} />
      )}
    </div>
  );
}

function GoalCard({ goal, county, profile, profilesLoaded, readiness, onPrepared, onPortalPrepared }) {
  const [generationState, setGenerationState] = useState({ status: "idle" });

  const links = [...(goal.records_request_goal_links || [])].sort(
    (a, b) => a.position - b.position
  );

  const isOnlinePortal = profile?.template_family === "online_portal";
  // Still resolving whether this goal's linked profile is an online_portal
  // profile (which would make it a candidate even with no goal-level
  // records_description) — until profilesLoaded is true, a goal with a
  // profile but no own records_description is neither confirmed a
  // candidate nor confirmed not one. Treated as "still checking" rather
  // than falling through to the hard "no profile" message, which would
  // otherwise flash briefly and incorrectly for an online_portal goal that
  // relies on its profile's default text.
  const stillResolvingCandidacy = Boolean(goal.request_profile_id) && !profile && !profilesLoaded;
  const isCandidate =
    !goal.locked
    && Boolean(goal.request_profile_id)
    && (isOnlinePortal || Boolean(goal.fill_payload?.request?.records_description) || stillResolvingCandidacy);
  const isReady = readiness?.status === "done" && readiness.result.ready === true;

  async function handlePrepareOnlinePortalRequest() {
    if (!isReady) return;

    setGenerationState({ status: "working" });
    try {
      const { data, error } = await supabase.rpc("rrg_prepare_online_request", {
        p_goal_id: goal.id,
        p_preview: false,
      });
      if (error) throw error;
      setGenerationState({ status: "idle" });
      onPortalPrepared(data);
    } catch (error) {
      // Mirrors the RequestProfileLifecycle convention elsewhere in this
      // feature: rrg_prepare_online_request's own raise-exception messages
      // are already curated, safe, user-facing text (see the migration) —
      // shown directly rather than re-explained through the PDF-specific
      // explainRenderFailure pipeline, which this RPC never touches.
      console.error("Failed to prepare online portal request:", error);
      setGenerationState({
        status: "error",
        message: error?.message || "This request could not be prepared right now. Please try again.",
        explanation: null,
      });
    }
  }

  async function handlePrepareRequest() {
    if (!isReady) return;
    if (isOnlinePortal) {
      await handlePrepareOnlinePortalRequest();
      return;
    }

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
      // Same explanation pipeline the operator draft-preview path uses —
      // this public "Prepare Request Form" action must never show a less
      // specific message than the operator preview does for the exact same
      // kind of failure. The full underlying error chain is logged only,
      // never rendered.
      logRenderFailureChain("Failed to generate request document:", error);
      const explanation = explainRenderFailure(error);
      setGenerationState({
        status: "error",
        message: [explanation.headline, explanation.detail].filter(Boolean).join(" "),
        explanation,
      });
    }
  }

  return (
    <article id={`goal-${goal.id}`} className={`goal-card${goal.locked ? " goal-card--locked" : ""}`}>
      <div className="goal-card__header">
        <h3 className="goal-card__title">{goal.title}</h3>
        {goal.locked && <span className="goal-card__lock-badge">Locked</span>}
        {/* Only shown when get_public_archive_goal would actually return
            this goal — see publicArchiveEligibility.js, kept in sync with
            that RPC's own gate rather than assuming every goal here has a
            reachable archive page. */}
        {isGoalPubliclyArchived(goal) && (
          <Link to={`/archive/goals/${goal.id}`} className="goal-card__details-link">
            More details
          </Link>
        )}
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
                <>
                  <p className="goal-card__notice">{generationState.message}</p>
                  <RenderFailureDiagnostic explanation={generationState.explanation} />
                </>
              )}
            </>
          ) : isCandidate ? (
            <p className="goal-card__notice">
              {readiness?.status === "checking" || !readiness
                ? "Checking request-form availability…"
                : readiness.result.message}
            </p>
          ) : goal.request_profile_id && profilesLoaded && !profile ? (
            // A profile id is present on the goal, but the public
            // (anon-RLS) profile-summary query didn't return it — under
            // request_profiles_read_current_verified, that only happens
            // for a profile that isn't (yet) verified and currently
            // effective. Distinct from "no profile linked at all" so an
            // operator awaiting activation isn't told the profile is
            // simply missing.
            <p className="goal-card__notice">
              This request profile has not been verified yet and is not available for requests.
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

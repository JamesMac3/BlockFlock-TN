import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePortalAuth } from "../../auth/portalAuth";
import { canOperatorPreviewGoalCounty, fetchDraftPreviewBundle } from "../../features/document-request/operatorPreview";
import { classifyRpcError } from "../../features/portal-admin/rpcErrors";
import {
  classifyOperatorPreviewError,
  operatorPreviewStageMessage,
  stageForReadinessCode,
} from "../../features/document-request/pdf/operator-preview-stages";
import RequestDeliveryPanel from "./RequestDeliveryPanel";
import "./OperatorDraftPreviewButton.css";

const MISSING_MIGRATION_MESSAGE =
  "Draft preview is not installed on this environment yet. The required database migration must be applied.";

// Exact, curated exception messages raised by
// get_draft_request_preview_bundle
// (supabase/migrations/20260821032341_operator_draft_request_preview.sql).
// Only a message in this allowlist is ever shown verbatim — anything else
// (a raw Postgres/PostgREST/storage error, a permission error naming a
// table or column, an unexpected exception message from a future RPC
// change) falls back to the generic "Could not load preview data" stage
// message instead. Keep this in sync with that migration's raise
// exception text.
const ALLOWLISTED_BUNDLE_MESSAGES = new Set([
  "Authentication required.",
  "Not authorized to preview this goal.",
  "Goal not found.",
  "This goal is locked and cannot be previewed.",
  "This goal has no linked request profile.",
  "Linked request profile not found.",
  "Only draft request profiles are available through the operator preview path.",
  "The goal and its request profile reference different government entities.",
  "Government entity not found.",
  "The goal and its government entity reference different counties.",
  "Base PDF evidence not found.",
  "Base PDF evidence has an unsupported object_kind.",
  "Base PDF evidence is not stored in the request-templates bucket.",
  "Base PDF evidence is not an application/pdf file.",
  "Base PDF evidence is not marked public.",
  "Base PDF evidence is not published.",
]);

// Same column lists RecordsRequestGoalsTiers.jsx uses to evaluate the
// public "Prepare Request Form" path — kept in exact sync so a verified
// profile previewed here goes through the identical readiness check the
// public roadmap performs, not a narrower or looser one.
const PROFILE_ROW_COLUMNS =
  "id, government_entity_id, version, schema_version, status, effective_from, effective_to, " +
  "policy_source_url, archived_policy_object_id, policy_summary, eligibility_mode, eligibility_jurisdiction, " +
  "eligibility_explanation, form_mode, form_explanation, fee_rule, aggregation_rule, submission_instructions, " +
  "template_family, renderer_type, base_pdf_object_id, continuation_profile_id, field_schema, template_schema, " +
  "validation_schema, output_options, verified_by, verified_at";

const ENTITY_ROW_COLUMNS =
  "id, legal_name, display_name, coordinator_name, coordinator_title, submission_email, mailing_address, portal_url";

// Several errors in the generation pipeline (TemplateResolverError,
// AcroformRendererError, OverlayRendererError, OutputValidationError,
// TemplateSourceError) wrap the real underlying failure in their own
// `causeValue` rather than Error's native `cause`, and template-resolver.ts
// re-wraps whatever a renderer throws into one generic RENDERER_FAILED
// message — so a bare `console.error(topLevelError)` only ever shows that
// generic wrapper text, never the specific code/diagnostics/message one or
// two levels down. This walks the full chain to the console only — never
// rendered, and never altering what's shown on screen.
function logGenerationErrorChain(label, error) {
  console.error(label, error);
  let current = error;
  let depth = 0;
  while (current?.causeValue && depth < 5) {
    console.error(`${label} — underlying cause (level ${depth + 1}):`, current.causeValue);
    current = current.causeValue;
    depth += 1;
  }
}

/**
 * Authorized administrator/chapter-master preview of a goal's request
 * document, profile-aware: a draft profile uses the protected
 * get_draft_request_preview_bundle RPC workflow (unchanged); a verified
 * profile is generated through the exact same evaluateGoalReadiness +
 * generateRequestDocument pipeline the public "Prepare Request Form"
 * action uses, so an operator previews precisely what a visitor would
 * receive. Every other profile state (in_review, retired, or the profile
 * failing to load) offers neither action — showing "Preview Draft" for a
 * profile that is no longer draft, or any preview at all for a state
 * neither pipeline supports, would be misleading.
 *
 * Renders nothing for anonymous visitors, ordinary authenticated users, or
 * a chapter master previewing a goal outside their assigned county — this
 * is only a UX pre-check; both pipelines independently re-verify on the
 * server (the RPC's own authorization check for drafts; ordinary RLS reads
 * plus evaluateGoalReadiness's verified/effective/entity checks for
 * verified profiles — the same checks the public, unauthenticated path
 * relies on, never weakened here). Never renders for a locked goal, and
 * never mutates the goal, profile, evidence, or archive.
 *
 * Every failure surface is stage-specific rather than one catch-all
 * message, so an operator can tell an unapplied migration from an
 * incomplete goal from a bad template hash from a rendering bug. The
 * underlying developer error is always logged via console.error and never
 * rendered — none of the stage messages embed a Postgres error, a storage
 * path, a URL, a hash, or any request data.
 */
export default function OperatorDraftPreviewButton({ goal, county, hasUnsavedChanges = false, onPreviewSuccess }) {
  const { authenticated, account } = usePortalAuth();
  const [state, setState] = useState({ status: "idle", headline: "", detail: "" });
  const [delivery, setDelivery] = useState(null);
  // null = not yet resolved (or not eligible to check at all); otherwise
  // the linked profile's live status string, or "unavailable" if the
  // profile row itself could not be loaded.
  const [profileStatus, setProfileStatus] = useState(null);

  const baseEligible =
    authenticated &&
    !goal.locked &&
    Boolean(goal.request_profile_id) &&
    canOperatorPreviewGoalCounty({ account, goalCountyId: county?.id });

  useEffect(() => {
    if (!baseEligible) {
      const timer = setTimeout(() => setProfileStatus(null), 0);
      return () => clearTimeout(timer);
    }
    let active = true;
    async function loadProfileStatus() {
      const { data, error } = await supabase
        .from("request_profiles")
        .select("status")
        .eq("id", goal.request_profile_id)
        .maybeSingle();
      if (!active) return;
      setProfileStatus(error || !data ? "unavailable" : data.status);
    }
    const timer = setTimeout(loadProfileStatus, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [baseEligible, goal.request_profile_id]);

  const isDraftMode = profileStatus === "draft";
  const isVerifiedMode = profileStatus === "verified";

  if (!baseEligible || (!isDraftMode && !isVerifiedMode)) return null;

  async function handleDraftPreview() {
    setState({ status: "working", headline: "", detail: "" });

    try {
      const { bundle, error } = await fetchDraftPreviewBundle({ supabase, goalId: goal.id });
      if (!bundle) {
        // error here is a raw RPC error message (fetchDraftPreviewBundle
        // already logged it to the console) — it is never rendered unless
        // it exactly matches one of this RPC's own curated exception
        // strings. Anything unrecognized (a raw Postgres/storage error, a
        // permission message naming a table, etc.) falls back to the
        // generic, safe stage message instead of leaking verbatim.
        const headline =
          classifyRpcError(error ? { message: error } : null) === "missing-migration"
            ? MISSING_MIGRATION_MESSAGE
            : error && ALLOWLISTED_BUNDLE_MESSAGES.has(error)
              ? error
              : operatorPreviewStageMessage("bundle");
        setState({ status: "error", headline, detail: "" });
        return;
      }

      const { evaluateOperatorPreviewReadiness } = await import(
        "../../features/document-request/pdf/operator-preview-readiness"
      );
      const readiness = evaluateOperatorPreviewReadiness({
        goal: bundle.goal,
        profileRow: bundle.profile,
        entityRow: bundle.entity,
      });

      if (!readiness.ready) {
        setState({
          status: "error",
          headline: operatorPreviewStageMessage(stageForReadinessCode(readiness.code)),
          detail: readiness.message,
        });
        return;
      }

      const { generateOperatorPreviewDocument } = await import(
        "../../features/document-request/pdf/generate-operator-preview-document"
      );
      const generated = await generateOperatorPreviewDocument(readiness.profile, readiness.data, {
        supabase,
        evidence: bundle.evidence,
      });

      // No object URL is created here — RequestDeliveryPanel owns that
      // lifecycle entirely, from generated.blob.
      setState({ status: "idle", headline: "", detail: "" });
      setDelivery({ profile: readiness.profile, data: readiness.data, generated, warnings: readiness.warnings });
      // A real, successful preview for this exact profile — the UX gate
      // the Request Profile Verification section requires before it will
      // offer Verify Profile at all.
      onPreviewSuccess?.(readiness.profile.id);
    } catch (previewError) {
      // The developer-facing detail is logged only — never rendered. See
      // the module doc comment above and logGenerationErrorChain.
      logGenerationErrorChain("Operator draft preview failed:", previewError);

      const stage = classifyOperatorPreviewError(previewError);
      setState({ status: "error", headline: operatorPreviewStageMessage(stage), detail: "" });
    }
  }

  async function handleVerifiedPreview() {
    setState({ status: "working", headline: "", detail: "" });

    try {
      const [profileResult, entityResult] = await Promise.all([
        supabase.from("request_profiles").select(PROFILE_ROW_COLUMNS).eq("id", goal.request_profile_id).maybeSingle(),
        goal.government_entity_id
          ? supabase.from("government_entities").select(ENTITY_ROW_COLUMNS).eq("id", goal.government_entity_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (profileResult.error || entityResult.error) {
        console.error(
          "Failed to load profile/entity for verified operator preview:",
          profileResult.error ?? entityResult.error,
        );
        setState({ status: "error", headline: operatorPreviewStageMessage("bundle"), detail: "" });
        return;
      }

      // Never a narrower or looser check than the public generator uses —
      // this is the exact same function, called with the exact same
      // shape of goal/profile/entity rows RecordsRequestGoalsTiers.jsx
      // (the public "Prepare Request Form" path) uses.
      const { evaluateGoalReadiness } = await import("../../features/document-request/pdf/readiness");
      const readiness = evaluateGoalReadiness({
        goal,
        profileRow: profileResult.data,
        entityRow: entityResult.data,
      });

      if (!readiness.ready) {
        // readiness.message is already a curated, safe sentence (see
        // readiness.ts) — never a raw database or storage error.
        setState({ status: "error", headline: readiness.message, detail: "" });
        return;
      }

      const { generateRequestDocument } = await import("../../features/document-request/pdf/generate-request-document");
      const generated = await generateRequestDocument(readiness.profile, readiness.data, { supabase });

      setState({ status: "idle", headline: "", detail: "" });
      setDelivery({ profile: readiness.profile, data: readiness.data, generated, warnings: readiness.warnings });
      onPreviewSuccess?.(readiness.profile.id);
    } catch (previewError) {
      logGenerationErrorChain("Verified operator preview failed:", previewError);
      const stage = classifyOperatorPreviewError(previewError);
      setState({ status: "error", headline: operatorPreviewStageMessage(stage), detail: "" });
    }
  }

  return (
    <>
      <div className="operator-preview">
        <button
          type="button"
          className="operator-preview__btn"
          onClick={isDraftMode ? handleDraftPreview : handleVerifiedPreview}
          disabled={state.status === "working"}
        >
          {state.status === "working"
            ? "Generating preview…"
            : isDraftMode
              ? "Preview Draft Request Form"
              : "Preview Verified Request Form"}
        </button>
        <p className="operator-preview__note">
          {isDraftMode
            ? "Operator-only draft preview — not publicly available. Uses the goal's last saved data."
            : "Generates the same request form the public roadmap would produce for this verified profile."}
        </p>
        {hasUnsavedChanges && (
          <p className="operator-preview__error">
            You have unsaved changes — save the goal first, or this preview will reflect the last saved
            version, not what's currently in the form.
          </p>
        )}
        {state.status === "error" && (
          <p className="operator-preview__error">
            {state.headline}
            {state.detail ? ` — ${state.detail}` : ""}
          </p>
        )}
      </div>

      {delivery && (
        <RequestDeliveryPanel
          county={county}
          goal={goal}
          profile={delivery.profile}
          data={delivery.data}
          generated={delivery.generated}
          validationWarnings={delivery.warnings}
          draftPreview={isDraftMode}
          onClose={() => setDelivery(null)}
        />
      )}
    </>
  );
}

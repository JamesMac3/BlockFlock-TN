import { useState } from "react";
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

/**
 * First slice of authorized administrator/chapter-master draft-request
 * preview. Renders nothing for anonymous visitors, ordinary authenticated
 * users, or a chapter master previewing a goal outside their assigned
 * county — this is only a UX pre-check; the server independently
 * re-verifies authorization on every call via
 * get_draft_request_preview_bundle. Never renders for a locked goal, and
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

  const eligible =
    authenticated &&
    !goal.locked &&
    Boolean(goal.request_profile_id) &&
    canOperatorPreviewGoalCounty({ account, goalCountyId: county?.id });

  if (!eligible) return null;

  async function handlePreview() {
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
      // the Request Profile lifecycle section requires before it will
      // offer Activate Profile at all.
      onPreviewSuccess?.(readiness.profile.id);
    } catch (previewError) {
      // The developer-facing detail is logged only — never rendered. See
      // the module doc comment above.
      console.error("Operator draft preview failed:", previewError);

      // OutputValidationError (e.g. PDF_REOPEN_FAILED) wraps the actual
      // underlying failure — a raw PDF.js/browser error — in its own
      // causeValue, which console.error alone does not reliably surface
      // (custom Error subclass properties aren't always shown when an
      // Error is logged directly). Logged separately here, still only to
      // the console, never rendered.
      if (previewError?.name === "OutputValidationError" && previewError.causeValue) {
        console.error("Underlying PDF inspection failure:", previewError.causeValue);
      }

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
          onClick={handlePreview}
          disabled={state.status === "working"}
        >
          {state.status === "working" ? "Generating preview…" : "Preview Draft Request Form"}
        </button>
        <p className="operator-preview__note">
          Operator-only draft preview — not publicly available. Uses the goal's last saved data.
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
          draftPreview
          onClose={() => setDelivery(null)}
        />
      )}
    </>
  );
}

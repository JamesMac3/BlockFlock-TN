import { useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  extensionForMimeType,
} from "../../features/portal-admin/archiveDocumentType";
import { extractFunctionInvokeError } from "../../features/portal-admin/functionInvokeErrors";
import { classifyPromoteGoalEvidenceError } from "../../features/portal-admin/promoteGoalEvidenceErrors";
import "./GoalCompletionUpload.css";

const OBJECT_KIND_OPTIONS = [
  { value: "responsive_record", label: "Evidence (a received record)" },
  { value: "correspondence", label: "Response email" },
];

const MISSING_ENTITY_MESSAGE =
  "Select a Government Entity in the goal's settings and save the goal before uploading documents.";

// Scrolls to and focuses GoalEditForm's own Government Entity <select> —
// that form is already rendered directly above this one inside the same
// GoalManagePanel (see RecordsRequestGoalsManager.jsx), so "editing the
// goal" is reusing that existing flow rather than opening a second one.
// goal.government_entity_id changing there calls onSave (threaded through
// as onUpdate), which refetches the goals list and re-renders this
// component with a fresh `goal` prop — no page reload, and no extra
// wiring needed here beyond reading government_entity_id straight off
// props on every render.
function focusGoalEntityField(goalId) {
  const target = document.getElementById(`goal-edit-entity-${goalId}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.focus();
}

export default function GoalCompletionUpload({ goal, county, onComplete, onCancel }) {
  const [file, setFile] = useState(null);
  const [objectKind, setObjectKind] = useState("responsive_record");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [markComplete, setMarkComplete] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState(null);
  const [progress, setProgress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Set when the most recent failure came back with retryable: false —
  // resubmitting the exact same attempt is known not to help (e.g. the
  // promotion failed and its own rollback also failed; an administrator
  // needs to intervene), so submission stays blocked until the operator
  // picks a different file, signaling a genuinely new attempt rather than
  // a bare retry of the one that already failed this way.
  const [disallowRetry, setDisallowRetry] = useState(false);

  // Read fresh from props on every render — never copied into local state
  // — so that saving the entity elsewhere (GoalEditForm, mounted
  // alongside this component in the same panel) and refetching the goals
  // list immediately re-enables submission here, with no reload and no
  // extra plumbing.
  const missingGovernmentEntity = !goal.government_entity_id;

  function validate() {
    if (missingGovernmentEntity) return MISSING_ENTITY_MESSAGE;
    if (!file) return "Select a file.";
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type)) return "This file type is not supported for the public archive.";
    if (file.size < 1 || file.size > MAX_UPLOAD_SIZE_BYTES) return "The file must be smaller than 50 MB.";
    if (!title.trim()) return "A public title is required.";
    if (!reviewed) return "Confirm the document has been reviewed for publication.";
    if (!county?.id) return "This goal has no associated county.";
    return null;
  }

  function handleFileChange(event) {
    setFile(event.target.files?.[0] ?? null);
    // A different file is a genuinely new attempt, not a bare retry of
    // whatever just failed non-retryably.
    setDisallowRetry(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setErrorCode(missingGovernmentEntity ? "MISSING_GOVERNMENT_ENTITY" : null);
      return;
    }

    setError("");
    setErrorCode(null);
    setSubmitting(true);

    try {
      // Never trust the operator's original filename as a storage path —
      // a fresh random name is generated from the validated MIME type.
      const extension = extensionForMimeType(file.type);
      const safeFilename = `${crypto.randomUUID()}.${extension}`;
      const privateStoragePath = `counties/${county.id}/incoming/${safeFilename}`;

      setProgress("Uploading...");
      const { error: uploadError } = await supabase.storage
        .from("archive-uploads")
        .upload(privateStoragePath, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        // Storage errors are a different shape entirely (never a
        // FunctionsError) — never run through extractFunctionInvokeError.
        setError(uploadError.message || "The file could not be uploaded to staging.");
        setErrorCode("STAGING_UPLOAD_FAILED");
        return;
      }

      setProgress("Publishing...");
      const { data, error: functionError } = await supabase.functions.invoke("promote-goal-evidence", {
        body: {
          goal_id: goal.id,
          private_storage_path: privateStoragePath,
          object_kind: objectKind,
          title: title.trim(),
          public_description: description.trim() || null,
          original_filename: file.name,
          mark_complete: markComplete,
        },
      });

      if (functionError) {
        // The staged file already exists at this point — a rejected
        // promotion never deletes it, and this form never retries the
        // promotion automatically. The message shown here is the edge
        // function's own actual JSON body, extracted through the SDK's
        // documented FunctionsHttpError/.context API — never the generic
        // "Edge Function returned a non-2xx status code" that reading
        // .message directly would give (see functionInvokeErrors.js).
        const extracted = await extractFunctionInvokeError(functionError);
        setError(extracted.message);
        setErrorCode(classifyPromoteGoalEvidenceError(extracted.message));
        if (!extracted.retryable) setDisallowRetry(true);
        return;
      }

      if (data?.error) {
        // Defensive only — the backend's current contract never returns
        // an { error } field on an HTTP 2xx response (every failure uses
        // a non-2xx status, handled above), but this is kept in case that
        // contract ever changes without every failure path following it.
        setError(data.error);
        setErrorCode(classifyPromoteGoalEvidenceError(data.error));
        return;
      }

      // Success — this is the only path that clears the form.
      setProgress("");
      onComplete();
    } catch (err) {
      // An error shape not handled above (e.g. crypto.randomUUID missing,
      // a non-Error value thrown) — still degrades to a safe message
      // rather than an unhandled crash, and never marks the upload
      // complete.
      console.error("Unexpected error while completing goal evidence upload:", err);
      setError(err?.message || "The document could not be completed.");
      setErrorCode("UNKNOWN");
    } finally {
      setProgress("");
      setSubmitting(false);
    }
  }

  const submitDisabled = submitting || missingGovernmentEntity || disallowRetry;

  return (
    <form className="goal-completion-upload" onSubmit={handleSubmit}>
      <h5>Add received document</h5>
      <p className="goal-completion-upload__note">
        The file uploads to a private staging area first, then publishes to the public
        archive only after this form succeeds. A failed attempt never marks the goal
        complete.
      </p>

      {missingGovernmentEntity && (
        <div className="rrg-error-message" role="alert">
          <p>{MISSING_ENTITY_MESSAGE}</p>
          <button type="button" className="rrg-btn rrg-btn--small" onClick={() => focusGoalEntityField(goal.id)}>
            Edit goal
          </button>
        </div>
      )}

      {error && (
        <div className="rrg-error-message" role="alert">
          <p>{error}</p>
          {errorCode === "MISSING_GOVERNMENT_ENTITY" && (
            <button type="button" className="rrg-btn rrg-btn--small" onClick={() => focusGoalEntityField(goal.id)}>
              Edit goal
            </button>
          )}
          {disallowRetry && (
            <p className="goal-completion-upload__note">
              Retrying will not resolve this. Choose a different file to try again, or contact an administrator.
            </p>
          )}
        </div>
      )}

      <div className="rrg-form-group">
        <label htmlFor={`upload-file-${goal.id}`}>File</label>
        <input
          id={`upload-file-${goal.id}`}
          type="file"
          onChange={handleFileChange}
          disabled={submitting}
          required
        />
      </div>

      <div className="rrg-form-group">
        <label htmlFor={`upload-kind-${goal.id}`}>Document type</label>
        <select
          id={`upload-kind-${goal.id}`}
          value={objectKind}
          onChange={(event) => setObjectKind(event.target.value)}
          disabled={submitting}
        >
          {OBJECT_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="rrg-form-group">
        <label htmlFor={`upload-title-${goal.id}`}>Public title</label>
        <input
          id={`upload-title-${goal.id}`}
          type="text"
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g., Executed contract with the selected vendor"
          disabled={submitting}
          required
        />
      </div>

      <div className="rrg-form-group">
        <label htmlFor={`upload-description-${goal.id}`}>Public description (optional)</label>
        <textarea
          id={`upload-description-${goal.id}`}
          maxLength={2000}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="rrg-form-group">
        <label>
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
            disabled={submitting}
          />
          I have reviewed this document and it is ready for public publication.
        </label>
      </div>

      <div className="rrg-form-group">
        <label>
          <input
            type="checkbox"
            checked={markComplete}
            onChange={(event) => setMarkComplete(event.target.checked)}
            disabled={submitting}
          />
          Mark this goal complete
        </label>
        <small>
          Unchecked, this adds the document and keeps (or moves) the goal to Partial —
          it never downgrades a goal that is already Complete.
        </small>
      </div>

      {progress && <p role="status">{progress}</p>}

      <div className="rrg-goal-actions">
        <button type="submit" className="rrg-btn rrg-btn--primary" disabled={submitDisabled}>
          {submitting ? "Working..." : "Publish document"}
        </button>
        <button type="button" className="rrg-btn" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

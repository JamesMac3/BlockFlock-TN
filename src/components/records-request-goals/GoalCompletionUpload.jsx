import { useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  extensionForMimeType,
} from "../../features/portal-admin/archiveDocumentType";
import "./GoalCompletionUpload.css";

const OBJECT_KIND_OPTIONS = [
  { value: "responsive_record", label: "Evidence (a received record)" },
  { value: "correspondence", label: "Response email" },
];

export default function GoalCompletionUpload({ goal, county, onComplete, onCancel }) {
  const [file, setFile] = useState(null);
  const [objectKind, setObjectKind] = useState("responsive_record");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [markComplete, setMarkComplete] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    if (!file) return "Select a file.";
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type)) return "This file type is not supported for the public archive.";
    if (file.size < 1 || file.size > MAX_UPLOAD_SIZE_BYTES) return "The file must be smaller than 50 MB.";
    if (!title.trim()) return "A public title is required.";
    if (!reviewed) return "Confirm the document has been reviewed for publication.";
    if (!county?.id) return "This goal has no associated county.";
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
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
      if (uploadError) throw uploadError;

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
      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);

      setProgress("");
      onComplete();
    } catch (err) {
      setError(err.message ?? "The document could not be completed.");
      setProgress("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="goal-completion-upload" onSubmit={handleSubmit}>
      <h5>Add received document</h5>
      <p className="goal-completion-upload__note">
        The file uploads to a private staging area first, then publishes to the public
        archive only after this form succeeds. A failed attempt never marks the goal
        complete.
      </p>

      {error && <div className="rrg-error-message">{error}</div>}

      <div className="rrg-form-group">
        <label htmlFor={`upload-file-${goal.id}`}>File</label>
        <input
          id={`upload-file-${goal.id}`}
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
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
        <button type="submit" className="rrg-btn rrg-btn--primary" disabled={submitting}>
          {submitting ? "Working..." : "Publish document"}
        </button>
        <button type="button" className="rrg-btn" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

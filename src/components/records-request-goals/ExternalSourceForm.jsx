import { useState } from "react";
import { supabase } from "../../lib/supabase";

// Adds an external HTTPS source to a goal via rrg_add_external_source. All
// real validation (HTTPS-only, no embedded credentials, no
// localhost/private-network destination) happens server-side in the RPC —
// this form's own checks are a fast, non-authoritative pre-check only.
export default function ExternalSourceForm({ goal, onComplete, onCancel }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [markComplete, setMarkComplete] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!label.trim()) {
      setError("A label is required.");
      return;
    }
    if (!url.trim().startsWith("https://")) {
      setError("An HTTPS URL is required.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: rpcError } = await supabase.rpc("rrg_add_external_source", {
        p_goal_id: goal.id,
        p_label: label.trim(),
        p_external_url: url.trim(),
        p_public_description: description.trim() || null,
        p_mark_complete: markComplete,
      });
      if (rpcError) throw rpcError;
      onComplete();
    } catch (err) {
      setError(err.message ?? "The source could not be added.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="goal-completion-upload" onSubmit={handleSubmit}>
      <h5>Add external source</h5>

      {error && <div className="rrg-error-message">{error}</div>}

      <div className="rrg-form-group">
        <label htmlFor={`external-label-${goal.id}`}>Label</label>
        <input
          id={`external-label-${goal.id}`}
          type="text"
          maxLength={200}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g., County meeting minutes (external site)"
          disabled={submitting}
          required
        />
      </div>

      <div className="rrg-form-group">
        <label htmlFor={`external-url-${goal.id}`}>HTTPS URL</label>
        <input
          id={`external-url-${goal.id}`}
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.gov/records"
          disabled={submitting}
          required
        />
      </div>

      <div className="rrg-form-group">
        <label htmlFor={`external-description-${goal.id}`}>Public description (optional)</label>
        <textarea
          id={`external-description-${goal.id}`}
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
            checked={markComplete}
            onChange={(event) => setMarkComplete(event.target.checked)}
            disabled={submitting}
          />
          Mark this goal complete
        </label>
      </div>

      <div className="rrg-goal-actions">
        <button type="submit" className="rrg-btn rrg-btn--primary" disabled={submitting}>
          {submitting ? "Working..." : "Add source"}
        </button>
        <button type="button" className="rrg-btn" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

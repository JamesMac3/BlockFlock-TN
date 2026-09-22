import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { onlinePortalUrlSchema } from "../../features/document-request/pdf/profile-schema";

// Exact literal values docs/online-portal-request-profiles.md and the
// database trigger rrg_validate_online_portal_profile both require —
// PDF-only fields (field mapping, template blocks, output formatting) are
// deliberately absent; an online_portal profile is a plain-text profile,
// not an executable template.
const FIELD_SCHEMA = { schema_version: 1, renderer_type: "online_portal", fields: [] };
const VALIDATION_SCHEMA = { schema_version: 1, required_paths: [], rules: [], scope_warnings: [], broad_mode_confirmation: false };
const OUTPUT_OPTIONS = { schema_version: 1 };

const ELIGIBILITY_MODE_OPTIONS = [
  ["not_stated", "Not stated"],
  ["residency_required", "Tennessee residency required"],
  ["citizenship_required", "Tennessee citizenship required"],
  ["conditional", "Conditional"],
  ["other", "Other"],
  ["unknown", "Unknown"],
];

function emptyFormState() {
  return {
    portal_url: "",
    request_text: "",
    policy_source_url: "",
    submission_instructions: "",
    eligibility_mode: "unknown",
    eligibility_jurisdiction: "",
    eligibility_explanation: "",
    fee_rule: "",
  };
}

function formStateFromProfile(profile) {
  return {
    portal_url: profile.template_schema?.portal_url ?? "",
    request_text: profile.template_schema?.request_text ?? "",
    policy_source_url: profile.policy_source_url ?? "",
    submission_instructions: profile.submission_instructions ?? "",
    eligibility_mode: profile.eligibility_mode ?? "unknown",
    eligibility_jurisdiction: profile.eligibility_jurisdiction ?? "",
    eligibility_explanation: profile.eligibility_explanation ?? "",
    fee_rule: profile.fee_rule ?? "",
  };
}

function validate(form) {
  const urlResult = onlinePortalUrlSchema.safeParse(form.portal_url);
  if (!urlResult.success) return urlResult.error.issues[0]?.message ?? "Enter a valid portal URL.";
  if (form.request_text.length > 12_000) return "Default request language must be 12000 characters or fewer.";
  if (!form.policy_source_url.trim()) return "Enter the policy source URL.";
  try {
    new URL(form.policy_source_url.trim());
  } catch {
    return "Enter a valid policy source URL.";
  }
  return null;
}

function rpcParamsFor(form, governmentEntityId) {
  return {
    p_policy_source_url: form.policy_source_url.trim(),
    p_eligibility_mode: form.eligibility_mode,
    p_eligibility_jurisdiction: form.eligibility_jurisdiction.trim() || null,
    p_eligibility_explanation: form.eligibility_explanation.trim() || null,
    p_form_mode: "portal_only",
    p_form_explanation: null,
    p_fee_rule: form.fee_rule.trim() || null,
    p_aggregation_rule: null,
    p_submission_instructions: form.submission_instructions.trim() || null,
    p_template_family: "online_portal",
    p_renderer_type: "online_portal",
    p_base_pdf_object_id: null,
    p_continuation_profile_id: null,
    p_field_schema: FIELD_SCHEMA,
    p_template_schema: { schema_version: 1, portal_url: form.portal_url.trim(), request_text: form.request_text },
    p_validation_schema: VALIDATION_SCHEMA,
    p_output_options: OUTPUT_OPTIONS,
    ...(governmentEntityId !== undefined ? { p_government_entity_id: governmentEntityId } : {}),
  };
}

/**
 * Create/edit UI for an "Online request portal" request profile — the only
 * profile type this codebase currently has any create/edit UI for at all
 * (see docs/online-portal-request-profiles.md: the PDF renderer types have
 * no equivalent frontend editor and are out of scope here). Reuses the
 * existing lifecycle RPCs unchanged: rrg_create_request_profile,
 * rrg_update_request_profile (draft only — verified profiles are
 * immutable), and rrg_replace_request_profile (clones a verified profile
 * into a new draft version, the same "replace" workflow every other
 * profile type already uses). Activation/retirement remain
 * RequestProfileLifecycle's job, unchanged, and are not duplicated here.
 *
 * Rendered inline in GoalForm/GoalEditForm next to the existing "Request
 * Profile" <select> — offers "Create" when governmentEntityId is set and
 * no profile is selected yet, an editable form when the selected profile
 * is a draft online_portal profile, a "Create new draft version" action
 * when it's verified, and nothing at all when the selected profile is a
 * PDF renderer type (that combination is left to whatever process already
 * manages those profiles, unaffected by this component).
 */
export default function OnlinePortalProfileEditor({ governmentEntityId, selectedProfile, onProfileSaved }) {
  const [form, setForm] = useState(emptyFormState);
  const [mode, setMode] = useState("closed"); // closed | creating | editing
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isExistingOnlinePortal = selectedProfile?.renderer_type === "online_portal";
  const isDraft = selectedProfile?.status === "draft";
  const isVerified = selectedProfile?.status === "verified";

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isExistingOnlinePortal) {
        setForm(formStateFromProfile(selectedProfile));
        setMode(isDraft ? "editing" : "closed");
      } else {
        setForm(emptyFormState());
        setMode("closed");
      }
      setError("");
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedProfile?.id, isExistingOnlinePortal, isDraft, selectedProfile]);

  if (!governmentEntityId && !isExistingOnlinePortal) return null;
  // A PDF-renderer profile is selected — this editor has nothing to offer.
  if (selectedProfile && !isExistingOnlinePortal) return null;

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    const validationMessage = validate(form);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "rrg_create_request_profile",
        rpcParamsFor(form, governmentEntityId),
      );
      if (rpcError) throw rpcError;
      onProfileSaved(data.id);
      setMode("editing");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft(event) {
    event.preventDefault();
    const validationMessage = validate(form);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("rrg_update_request_profile", {
        p_profile_id: selectedProfile.id,
        ...rpcParamsFor(form),
      });
      if (rpcError) throw rpcError;
      onProfileSaved(selectedProfile.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReplace() {
    setSaving(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("rrg_replace_request_profile", {
        p_profile_id: selectedProfile.id,
      });
      if (rpcError) throw rpcError;
      onProfileSaved(data.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (mode === "closed" && !isVerified) {
    return (
      <div className="rrg-form-group">
        <button type="button" className="rrg-btn" onClick={() => { setForm(emptyFormState()); setMode("creating"); }}>
          + Create Online Request Portal Profile
        </button>
      </div>
    );
  }

  if (isVerified) {
    return (
      <div className="rrg-form-group">
        <p className="rrg-fill-payload__hint">
          This verified online request portal profile is immutable. Create a new draft version to make changes.
        </p>
        {error && <div className="rrg-error-message">{error}</div>}
        <button type="button" className="rrg-btn" disabled={saving} onClick={handleReplace}>
          {saving ? "Creating…" : "Create New Draft Version"}
        </button>
      </div>
    );
  }

  return (
    <fieldset className="rrg-form-group" style={{ border: "1px solid #e5e7eb", borderRadius: "0.375rem", padding: "1rem" }}>
      <legend>{mode === "creating" ? "New Online Request Portal Profile" : "Online Request Portal Profile"}</legend>
      {error && <div className="rrg-error-message">{error}</div>}

      <label htmlFor="portal-url">Official request website URL</label>
      <input
        id="portal-url"
        type="url"
        maxLength={2048}
        placeholder="https://records.example.gov/requests/new"
        value={form.portal_url}
        onChange={(event) => updateField("portal_url", event.target.value)}
        required
      />

      <label htmlFor="portal-request-text">Default request language</label>
      <textarea
        id="portal-request-text"
        rows={5}
        maxLength={12_000}
        value={form.request_text}
        onChange={(event) => updateField("request_text", event.target.value)}
      />
      <small className="rrg-fill-payload__hint">
        Used only when a goal has no records description of its own — a goal's own saved request language always
        takes precedence over this default.
      </small>

      <label htmlFor="portal-policy-source-url">Policy source URL</label>
      <input
        id="portal-policy-source-url"
        type="url"
        maxLength={2048}
        value={form.policy_source_url}
        onChange={(event) => updateField("policy_source_url", event.target.value)}
        required
      />

      <label htmlFor="portal-submission-instructions">Submission instructions</label>
      <textarea
        id="portal-submission-instructions"
        rows={3}
        maxLength={20_000}
        value={form.submission_instructions}
        onChange={(event) => updateField("submission_instructions", event.target.value)}
      />

      <label htmlFor="portal-eligibility-mode">Eligibility</label>
      <select
        id="portal-eligibility-mode"
        value={form.eligibility_mode}
        onChange={(event) => updateField("eligibility_mode", event.target.value)}
      >
        {ELIGIBILITY_MODE_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      <label htmlFor="portal-eligibility-jurisdiction">Eligibility jurisdiction</label>
      <input
        id="portal-eligibility-jurisdiction"
        type="text"
        maxLength={100}
        value={form.eligibility_jurisdiction}
        onChange={(event) => updateField("eligibility_jurisdiction", event.target.value)}
      />

      <label htmlFor="portal-eligibility-explanation">Eligibility explanation</label>
      <textarea
        id="portal-eligibility-explanation"
        rows={2}
        maxLength={10_000}
        value={form.eligibility_explanation}
        onChange={(event) => updateField("eligibility_explanation", event.target.value)}
      />

      <label htmlFor="portal-fee-rule">Fee rule</label>
      <textarea
        id="portal-fee-rule"
        rows={2}
        maxLength={10_000}
        value={form.fee_rule}
        onChange={(event) => updateField("fee_rule", event.target.value)}
      />

      <div className="rrg-goal-actions">
        <button
          type="button"
          className="rrg-btn rrg-btn--primary"
          disabled={saving}
          onClick={mode === "creating" ? handleCreate : handleSaveDraft}
        >
          {saving ? "Saving…" : mode === "creating" ? "Create Profile" : "Save Changes"}
        </button>
        {mode === "creating" && (
          <button type="button" className="rrg-btn" disabled={saving} onClick={() => { setMode("closed"); setError(""); }}>
            Cancel
          </button>
        )}
      </div>
    </fieldset>
  );
}

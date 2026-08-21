import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { requestProfileSchema } from "../../features/document-request/pdf/profile-schema";
import { requestDocumentDataSchema } from "../../features/document-request/pdf/request-data-schema";
import { adaptRequestProfileRow } from "../../features/document-request/pdf/profile-adapter";
import { deriveFieldDescriptors, pruneUnsupportedFillPayloadKeys } from "../../features/document-request/pdf/fill-payload-fields";

const FIELD_LABELS = {
  records_description: "Records description (request language)",
  delivery_method: "Delivery method",
  department_or_division: "Department or division",
  record_category_label: "Record category",
  date_from_mm_dd_yyyy: "Date from",
  date_to_mm_dd_yyyy: "Date to",
};

function isoToMmDdYyyy(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${month}/${day}/${year}` : "";
}

function mmDdYyyyToIso(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? "");
  if (!match) return "";
  const [, month, day, year] = match;
  return `${year}-${month}-${day}`;
}

// Profile-aware structured fill_payload editor: renders only the request.*
// fields the selected request profile actually declares (via
// fill-payload-fields.ts, which reads the profile's own field_schema /
// template_schema — never a hardcoded or parallel field list), and
// validates the in-progress values through the real
// requestDocumentDataSchema before allowing Save. There is no requester
// identity/signature/date field anywhere in that schema, so none can be
// introduced here.
// goalLanguage is the goal's own public_summary — required by
// requestDocumentDataSchema as request.goal_language, but it is edited
// elsewhere (the goal's Public Summary field) and is only ever read here
// to make validation of the *other* fields possible. It is never rendered
// as an editable field in this component and is never written back into
// fill_payload — the investigative purpose and the request language stay
// in their separate, existing homes.
export default function FillPayloadFields({ profileId, entity, initialRequest, goalLanguage, onValidChange }) {
  const [profile, setProfile] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [request, setRequest] = useState(initialRequest ?? {});
  const [issues, setIssues] = useState([]);
  const [otherFields, setOtherFields] = useState({});

  // useState's initial value is only read on the very first render, so it
  // alone cannot pick up a saved fill_payload that arrives after mount (the
  // goal editor initially fetches a lightweight projection, then hydrates
  // the full row — or the operator switches which goal is open). The
  // caller is responsible for keeping initialRequest referentially stable
  // while nothing relevant has changed (see EMPTY_FILL_REQUEST in
  // RecordsRequestGoalsManager.jsx) so this effect fires exactly when the
  // underlying saved data actually changes, never on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setRequest(initialRequest ?? {});
      setOtherFields({});
    }, 0);
    return () => clearTimeout(timer);
  }, [initialRequest]);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!profileId) {
        setLoadState("no-profile");
        return;
      }
      setLoadState("loading");
      const { data, error } = await supabase
        .from("request_profiles")
        .select(
          "id, government_entity_id, version, schema_version, status, effective_from, effective_to, policy_source_url, " +
          "archived_policy_object_id, policy_summary, eligibility_mode, eligibility_jurisdiction, eligibility_explanation, " +
          "form_mode, form_explanation, fee_rule, aggregation_rule, submission_instructions, template_family, renderer_type, " +
          "base_pdf_object_id, continuation_profile_id, field_schema, template_schema, validation_schema, output_options, " +
          "verified_by, verified_at"
        )
        .eq("id", profileId)
        .single();
      if (!active) return;
      if (error || !data) {
        setLoadState("error");
        return;
      }
      const parsed = requestProfileSchema.safeParse(adaptRequestProfileRow(data));
      if (!parsed.success) {
        setLoadState("error");
        return;
      }
      setProfile(parsed.data);
      setRequest((current) => pruneUnsupportedFillPayloadKeys(current, parsed.data));
      setLoadState("ready");
    }

    loadProfile();
    return () => { active = false; };
  }, [profileId]);

  useEffect(() => {
    function revalidate() {
      if (!profile || !entity) {
        onValidChange(false, {}, null);
        return;
      }
      const input = {
        government_entity: { id: String(entity.id), legal_name: entity.legal_name, display_name: entity.display_name },
        request: { ...request, goal_language: goalLanguage?.trim() || undefined },
        profile: { id: profile.id, version: profile.version, government_entity_id: profile.government_entity_id },
      };
      const result = requestDocumentDataSchema.safeParse(input);
      if (result.success) {
        setIssues([]);
        onValidChange(true, request, null);
      } else {
        const filteredIssues = result.error.issues.filter((issue) => issue.path[0] === "request");
        setIssues(filteredIssues);
        // A caller-facing summary naming the exact field, not just "invalid"
        // — this component is the only place that knows the field labels.
        const firstIssue = filteredIssues[0];
        const issueSummary = firstIssue
          ? `${FIELD_LABELS[firstIssue.path[1]] ?? firstIssue.path[1]}: ${firstIssue.message}`
          : "The structured request data is invalid.";
        onValidChange(false, request, issueSummary);
      }
    }

    const timer = setTimeout(revalidate, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onValidChange is a stable setter passed by the parent
  }, [profile, entity, request, goalLanguage]);

  function update(key, value) {
    setRequest((current) => ({ ...current, [key]: value }));
  }

  function issueFor(key) {
    return issues.find((issue) => issue.path[1] === key)?.message;
  }

  // The select's own value and the saved field value are deliberately kept
  // separate: the select may show the "__other__" sentinel while the real
  // stored value is the operator's typed text (or "" before they've typed
  // anything). Combining them into one value previously made the select
  // fall into a state matching no <option> the instant a character was
  // typed, which hid the text input again. A field also renders in "other"
  // mode automatically for a hydrated saved value that isn't one of the
  // profile's predefined choices, with no extra state needed.
  function isOtherValue(field, currentValue) {
    if (!field.allowOther) return false;
    if (otherFields[field.key]) return true;
    return Boolean(currentValue) && !field.choices.includes(currentValue);
  }

  function handleChoiceSelect(field, selected) {
    if (selected === "__other__") {
      setOtherFields((current) => ({ ...current, [field.key]: true }));
      update(field.key, "");
      return;
    }
    if (otherFields[field.key]) {
      setOtherFields((current) => {
        const next = { ...current };
        delete next[field.key];
        return next;
      });
    }
    update(field.key, selected);
  }

  if (loadState === "no-profile") {
    return <p className="rrg-fill-payload__hint">Select a request profile to enter structured request data.</p>;
  }
  if (loadState === "loading") {
    return <p className="rrg-fill-payload__hint">Loading profile fields…</p>;
  }
  if (loadState === "error") {
    return <p className="rrg-error-message">This request profile could not be loaded.</p>;
  }

  const descriptors = deriveFieldDescriptors(profile);

  return (
    <div className="rrg-fill-payload">
      {descriptors.map((field) => {
        const label = FIELD_LABELS[field.key] ?? field.key;
        const error = issueFor(field.key);
        const value = request[field.key] ?? "";

        return (
          <div className="rrg-form-group" key={field.key}>
            <label>
              {label}{field.required && " *"}
              {"maxLength" in field && field.maxLength && <small> (max {field.maxLength} characters)</small>}
            </label>

            {field.kind === "textarea" && (
              <textarea
                rows={4}
                maxLength={field.maxLength}
                value={value}
                onChange={(event) => update(field.key, event.target.value)}
              />
            )}

            {field.kind === "choice" && (
              <select
                value={isOtherValue(field, value) ? "__other__" : value}
                onChange={(event) => handleChoiceSelect(field, event.target.value)}
              >
                <option value="">{field.required ? "-- Select --" : "-- Not specified --"}</option>
                {field.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                {field.allowOther && <option value="__other__">Other (enter below)</option>}
              </select>
            )}
            {field.kind === "choice" && isOtherValue(field, value) && (
              <input
                type="text"
                placeholder="Enter a value"
                value={value}
                onChange={(event) => update(field.key, event.target.value)}
              />
            )}

            {field.kind === "text" && (
              <input
                type="text"
                maxLength={field.maxLength}
                value={value}
                onChange={(event) => update(field.key, event.target.value)}
              />
            )}

            {field.kind === "date" && (
              <input
                type="date"
                value={mmDdYyyyToIso(value) || undefined}
                onChange={(event) => update(field.key, isoToMmDdYyyy(event.target.value))}
              />
            )}

            {error && <small className="rrg-fill-payload__error">{error}</small>}
          </div>
        );
      })}
    </div>
  );
}

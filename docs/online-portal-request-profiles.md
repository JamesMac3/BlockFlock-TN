# Online portal records requests — frontend contract

Backend applied to FlockBlockDATA on 2026-09-22. Frontend implementation is pending.
Migrations: `20260922170741_online_portal_request_profiles.sql` and
`20260922170947_request_profile_creator_default.sql`.
No existing profiles/goals were converted. Do not invent an official portal URL.

## Editing and lifecycle

Use the existing `rrg_create_request_profile`, `rrg_update_request_profile`,
`rrg_activate_request_profile`, `rrg_replace_request_profile`, and
`rrg_retire_request_profile` RPCs. Their signatures did not change.
Admins manage all counties; active chapter masters manage their own county.
Verified profiles remain immutable. Preview does not automatically activate.

Offer “Online request portal” as a profile type. The profile editor needs:
- Official portal URL (required HTTPS, maximum 2048 characters; no credentials,
  spaces or backslashes; use browser URL parsing as well).
- Default request language (plain multiline text, optional, maximum 12000 Unicode
  characters). Explain that the goal's saved records description takes precedence.
- Existing policy source, eligibility, fees and submission instructions.

Save the existing RPC parameters with these exact values for this type:

```json
{
  "p_template_family": "online_portal",
  "p_renderer_type": "online_portal",
  "p_form_mode": "portal_only",
  "p_base_pdf_object_id": null,
  "p_continuation_profile_id": null,
  "p_field_schema": {
    "schema_version": 1,
    "renderer_type": "online_portal",
    "fields": []
  },
  "p_template_schema": {
    "schema_version": 1,
    "portal_url": "https://records.example.org/requests/new",
    "request_text": ""
  },
  "p_validation_schema": {
    "schema_version": 1,
    "required_paths": [],
    "rules": [],
    "scope_warnings": [],
    "broad_mode_confirmation": false
  },
  "p_output_options": { "schema_version": 1 }
}
```

Include all other existing RPC parameters as usual. The JSON schema is strict:
do not add PDF fields, template blocks, invented placeholders, or unsupported
validation rules. These are plain text profiles, not executable templates.
No PDF file, hash, mapping, fonts, renderer or evidence object is needed.
The policy-source URL remains separately required by the existing table.
The creator ID now defaults to the current authenticated user, fixing the old
create/replace RPC failure caused by an omitted NOT NULL created_by column.

The goal-specific request-language textarea still saves to
`fill_payload.request.records_description`; a minimal empty payload is
`{"request":{}}`, NOT `{}`. Keep it distinct from public_summary.

## Prepare and preview

Call `supabase.rpc('rrg_prepare_online_request', { p_goal_id: goal.id,
p_preview: false })` for public preparation. Use true only in the authorized
operator preview flow. The function is SECURITY INVOKER and retains RLS.
Public calls require a public, unlocked goal and verified, currently effective
profile. Operator previews allow draft/verified profiles for the caller's county
authority; private goals remain private. Retired/in_review profiles, inactive
entities and goal/profile county/entity mismatches are rejected.

Returns JSON:
- mode: online_portal
- goal_id, profile_id, profile_version, profile_status, preview
- title, entity_name, portal_url, request_text
- text_source: goal or profile_default
- submission_instructions (nullable)
- eligibility_mode, eligibility_jurisdiction, eligibility_explanation, fee_rule

Text precedence: a non-whitespace goal records_description, otherwise the
profile default. Empty results or text over 12000 characters produce a clear
error. Exact text and newlines are preserved; there is no truncation or
public_summary substitution. The 12000 limit is OUR storage/preparation limit,
not a claim about the destination portal's limit. No remote submission occurs.

The existing `get_draft_request_preview_bundle` also transports this profile's
JSON unchanged, with evidence=null. It remains available if the editor needs it.
The new RPC is the final authority for the copy/paste popup; do not route this
type through PDF readiness, PDF template loading, PDF integrity checking, or PDF
generation. Update strict schemas/adapters and all goal/profile selectors to
accept the new branch without weakening checks for existing PDF types.

## Popup behavior

Keep “Prepare Request Form” as the entry action. For online_portal, open a
responsive dialog containing the exact returned text in a selectable read-only
multiline box, a labeled copy icon/button, an “Open request website” link, and
directions: “Copy the request below, open the agency's website, paste it into
the records description field, complete any required information, and submit
your request there.” Show saved additional instructions, eligibility and fees.

Use plain text rendering only. Link opens via a real anchor with target=_blank
and rel=noopener noreferrer. Never embed the request text or personal details
in the destination URL. Clipboard write must happen from the copy button's
click handler (especially iPhone Safari); show “Copied” only after success.
If denied/unavailable, select the text and explain manual copy. Support keyboard
focus, Escape/close, mobile scrolling and accessible button names. No auto-open,
auto-copy, auto-submit, or automatic goal-completion/reminder scheduling.

Operator draft preview must show this same text/link layout and enable the
existing explicit activation step after successful preview. Do not auto-activate.
Profile-level preview may use the saved default; if it is empty, explain that a
goal needs request language rather than inventing example request content.

## Verification already performed

`supabase/tests/online_portal_request_profiles.test.sql` passed 27 checks against
the live database inside a rolled-back transaction. Includes chapter create,
foreign-county create/preview denial, unsafe/missing URLs, oversized default,
exact goal text/newlines, draft/private/anonymous denial, activation, verified
immutability, public preparation, inactive entities, fallback text, locks,
replacement, empty text, existing preview bundle, future effective dates, admin
create and legacy generated-letter create. Fixtures were rolled back.
No frontend build/browser tests were run for these SQL-only changes.
Security advisors did not identify either new function; existing project-wide
findings remain outside this change.

Frontend acceptance tests: public portal path never loads PDF modules; default
and goal text precedence; saves/reloads for admin and chapter; existing PDF
prepare unchanged; disabled/failed clipboard; external link attributes; preview
versus activation; mobile/Safari behavior; meaningful missing-text/URL errors.
Do not claim physical-iPhone verification unless actually performed.

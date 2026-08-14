# Request Profiles Contract v1

## Purpose

`request_profiles` is the verified, versioned contract between jurisdiction research, the chapter-master editor, and the browser PDF generator. A profile describes one governing request procedure and exactly one rendering path. It contains no requester data and no executable code.

## Storage boundary

Keep fields needed for selection, RLS, verification, provenance, and version history as typed database columns. Use JSONB only for renderer configuration and validation rules.

### Typed columns

```text
id uuid primary key
government_entity_id uuid not null
version integer not null
schema_version integer not null default 1
status draft | in_review | verified | retired
effective_from date nullable
effective_to date nullable
policy_source_url text not null
archived_policy_object_id uuid nullable
policy_summary text nullable
eligibility_mode not_stated | residency_required | citizenship_required | conditional | other | unknown
eligibility_jurisdiction text nullable
eligibility_explanation text nullable
form_mode not_required | optional | required | portal_only | unknown
form_explanation text nullable
fee_rule text nullable
aggregation_rule text nullable
submission_instructions text nullable
template_family municipal_form | municipal_letter | tennessee_model
renderer_type acroform | overlay | generated_letter
base_pdf_object_id uuid nullable
continuation_profile_id uuid nullable
field_schema jsonb not null default '{}'
template_schema jsonb not null default '{}'
validation_schema jsonb not null default '{}'
output_options jsonb not null default '{}'
verified_by uuid nullable
verified_at timestamptz nullable
created_at timestamptz not null
updated_at timestamptz not null
```

Required database constraints:

- Unique `(government_entity_id, version)`.
- `version >= 1` and `schema_version = 1` for the first implementation.
- Verified profiles require `verified_by`, `verified_at`, and a source URL.
- AcroForm and overlay profiles require `base_pdf_object_id`.
- Generated-letter profiles must not require a base PDF.
- A continuation profile cannot reference itself.
- Effective date ranges may not be inverted.
- Only verified, currently effective profiles are readable by the anonymous generator.
- Published profiles are immutable; corrections create a new version.

Eligibility and form requirements use machine-readable enums plus cited explanatory text. Fee and aggregation rules remain prose in v1 because municipal fee schedules vary too much to enforce safely without a separate structured fee model; they may produce warnings, but the generator does not calculate or promise fees.

## Normalized request data

Every renderer receives the same local-only object:

```ts
type RequestDocumentData = {
  government_entity: {
    id: string
    legal_name: string
    display_name: string
    coordinator_name?: string
    coordinator_title?: string
    submission_email?: string
    mailing_address?: string
    portal_url?: string
  }
  request: {
    goal_language: string
    records_description: string
    vendor_or_system?: string
    department_or_division?: string
    record_category_label?: string
    date_from?: string
    date_to?: string
    delivery_method: "electronic" | "inspection" | "paper"
  }
  profile: {
    id: string
    version: number
    government_entity_id: string
  }
}
```

The frontend constructs this object after loading a verified profile. It never requests or receives requester identity, ID proof, payment authorization, request date, or signature data.

## Placeholder contract

The resolver accepts only exact dotted paths from this allowlist:

```text
government_entity.legal_name
government_entity.display_name
government_entity.coordinator_name
government_entity.coordinator_title
government_entity.submission_email
government_entity.mailing_address
request.goal_language
request.records_description
request.vendor_or_system
request.department_or_division
request.record_category_label
request.date_from
request.date_to
request.date_from_mm_dd_yyyy
request.date_to_mm_dd_yyyy
request.delivery_method
```

Token syntax is `{{exact.allowlisted.path}}`. No conditionals, loops, helpers, partials, HTML, function calls, bracket access, prototype traversal, or arbitrary expressions are supported. Unknown tokens are generation-blocking errors. Optional empty values are handled by structured block rules rather than template logic.

## Shared JSON rules

All four JSONB documents contain a `schema_version` field. Unknown properties are rejected during authoring and loading. Coordinates use PDF points with the origin at the bottom-left. Page indexes are zero-based. Colors use six-character hexadecimal strings. Lengths and array sizes have explicit limits in the Zod contract.

## `field_schema`

This is a discriminated union keyed by `renderer_type`.

### AcroForm

```json
{
  "schema_version": 1,
  "renderer_type": "acroform",
  "fields": [
    {
      "source": "request.records_description",
      "pdf_field": "RecordsDescription",
      "kind": "text",
      "required": true,
      "max_length": 12000,
      "multiline": true
    }
  ]
}
```

Supported v1 kinds are `text`, `checkbox`, `radio`, and `dropdown`. The profile may name only fields verified to exist in the archived base PDF.

### Coordinate overlay

```json
{
  "schema_version": 1,
  "renderer_type": "overlay",
  "fields": [
    {
      "source": "request.records_description",
      "page": 0,
      "x": 72,
      "y": 220,
      "width": 468,
      "height": 150,
      "font_key": "body",
      "font_size": 10,
      "line_height": 13,
      "max_lines": 11,
      "required": true,
      "overflow": "continuation",
      "continuation_label": "See attached continuation."
    }
  ]
}
```

`overflow` is `error`, `shrink`, or `continuation`. `shrink` may not go below the minimum font size in `output_options`. Continuation requires both a profile-authored `continuation_label` and a verified `continuation_profile_id`.

### Generated letter

Generated letters use an empty field list because layout is controlled by `template_schema`:

```json
{
  "schema_version": 1,
  "renderer_type": "generated_letter",
  "fields": []
}
```

## `template_schema`

AcroForm and overlay profiles normally use an empty blocks array. Generated letters store structured blocks, never JSX or HTML:

```json
{
  "schema_version": 1,
  "document_title": "Tennessee Public Records Request",
  "blocks": [
    {
      "id": "recipient",
      "type": "address",
      "lines": [
        "{{government_entity.coordinator_title}}",
        "{{government_entity.legal_name}}",
        "{{government_entity.mailing_address}}"
      ],
      "omit_empty_lines": true,
      "locked": true
    },
    {
      "id": "records",
      "type": "paragraph",
      "text": "I request access to the following public records: {{request.records_description}}",
      "locked": false
    },
    {
      "id": "signature",
      "type": "signature",
      "lines": ["Name: ____________________", "Signature: ____________________", "Date: ____________________"],
      "locked": true
    }
  ]
}
```

Supported v1 block types are `heading`, `address`, `paragraph`, `bullet_list`, `notice`, `spacer`, `divider`, `signature`, and `page_break`. Blocks may be `locked` or editable. Optional blocks use an explicit `include_when_present` allowlisted path; they do not contain expressions.

## `validation_schema`

```json
{
  "schema_version": 1,
  "required_paths": [
    "request.goal_language",
    "request.records_description"
  ],
  "rules": [
    {
      "path": "request.records_description",
      "type": "string_length",
      "min": 20,
      "max": 12000,
      "severity": "error",
      "message": "Describe the records with enough detail for the custodian to identify them."
    },
    {
      "path": "request.date_from",
      "other_path": "request.date_to",
      "type": "date_order",
      "severity": "error",
      "message": "The start date must not follow the end date."
    }
  ],
  "scope_warnings": {
    "maximum_date_span_days": 730,
    "maximum_record_labels": 3,
    "broad_mode_confirmation": true
  }
}
```

Supported v1 rule types are `required`, `string_length`, `email`, `date`, `date_order`, `number_range`, and `boolean_true`. Profiles provide user-facing messages but cannot introduce code or regular expressions.

## `output_options`

```json
{
  "schema_version": 1,
  "flatten_acroform": false,
  "preserve_source_metadata": false,
  "pdf_title_pattern": "Public Records Request - {{government_entity.display_name}}",
  "filename_pattern": "public-records-request.pdf",
  "page_size": "LETTER",
  "margin_points": 72,
  "default_font_key": "body",
  "minimum_font_size": 8,
  "show_page_numbers": true,
  "allow_continuation": true
}
```

Filename substitutions are sanitized after resolution. Output options are allowlisted; arbitrary PDF metadata keys are not accepted.

## Verification lifecycle

```text
draft
→ in_review
→ verified
→ retired
```

- Chapter masters may draft profiles for entities in their authorized county.
- A draft must pass structural validation and render against a non-personal test fixture before review.
- Verification records the reviewer, date, source policy URL, archived source form, and content hashes for every base PDF.
- Only an authorized verifier may publish a version.
- Published JSON and source-PDF references are immutable.
- A changed municipal form or rule creates a new profile version; the prior version receives `effective_to` and remains available for historical campaigns.
- The generator refuses draft, retired, future-effective, expired, schema-incompatible, or source-hash-mismatched profiles.

## Authoring safeguards

- Use a structured editor rather than accepting raw JSON from chapter masters.
- Preview with non-personal request content only.
- Inspect AcroForm field names from the archived source PDF and require an exact match.
- Render overlay calibration guides during authoring, but never include them in final output.
- Require a second-person review for locked legal wording, recipient routing, citizenship language, and submission instructions.
- Record profile creation, review, verification, retirement, and emergency withdrawal in `security_audit_events`.

## Decisions fixed for v1

- One renderer per profile version.
- No executable templates and no Mustache dependency.
- No arbitrary regular expressions in profile validation.
- No requester identity data is requested, received, validated, templated, or stored.
- Official AcroForm identity, request-date, citizenship, and signature fields remain blank and editable.
- Municipal AcroForms are never flattened.
- The public generator has no freeform or advanced editor.
- No silent fallback from a failed municipal profile to another jurisdiction's form.
- A failed verified profile stops generation and directs the user to the official source and administrator contact.
- Foreign forms may inform layout research but cannot be published as governing templates.

## Next implementation unit

Translate this contract into:

1. A Supabase migration for the typed columns, enums, constraints, and verified-profile read policy.
2. `profile-schema.ts` containing the discriminated Zod schemas.
3. `request-data-schema.ts` containing `RequestDocumentData`.
4. Unit fixtures proving valid and invalid examples for all three renderer types.

The first implementation artifacts include the portable Supabase migration, profile and request-data schemas, restricted placeholder resolver, strict template dispatcher, all three renderers, shared output validator, integration map, and hostile-input test suites. The output validator rechecks profile/request identity, blocks renderer diagnostics, enforces output size and page limits, reopens the file through PDF.js, detects unresolved tokens in extracted text, and sanitizes filenames. Client write policies remain intentionally absent until the migration can bind to the application's existing county, role, and suspension authorization helpers.

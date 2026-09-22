import { z } from "zod";
import { allowedPlaceholderPaths } from "./request-data-schema";
import { entityIdSchema } from "./entity-id";

const schemaVersion = z.literal(1);
const placeholderPath = z.enum(allowedPlaceholderPaths);
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const acroformField = z
  .object({
    source: placeholderPath,
    pdf_field: z.string().trim().min(1).max(200),
    kind: z.enum(["text", "checkbox", "radio", "dropdown"]),
    required: z.boolean().default(false),
    max_length: z.number().int().min(1).max(12_000).optional(),
    multiline: z.boolean().optional(),
    option_value: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

const overlayField = z
  .object({
    source: placeholderPath,
    page: z.number().int().min(0).max(500),
    x: z.number().finite().min(0).max(10_000),
    y: z.number().finite().min(0).max(10_000),
    width: z.number().finite().positive().max(10_000),
    height: z.number().finite().positive().max(10_000),
    font_key: z.string().trim().min(1).max(100),
    font_size: z.number().finite().min(4).max(72),
    line_height: z.number().finite().min(4).max(100),
    max_lines: z.number().int().min(1).max(500),
    color: hexColor.default("#000000"),
    required: z.boolean().default(false),
    overflow: z.enum(["error", "shrink", "continuation"]),
    continuation_label: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((field, context) => {
    if (field.overflow === "continuation" && !field.continuation_label) {
      context.addIssue({ code: "custom", path: ["continuation_label"], message: "Continuation overflow requires a verified label." });
    }
    if (field.overflow !== "continuation" && field.continuation_label) {
      context.addIssue({ code: "custom", path: ["continuation_label"], message: "Only continuation fields may define a continuation label." });
    }
  });

export const fieldSchema = z.discriminatedUnion("renderer_type", [
  z.object({ schema_version: schemaVersion, renderer_type: z.literal("acroform"), fields: z.array(acroformField).max(250) }).strict(),
  z.object({ schema_version: schemaVersion, renderer_type: z.literal("overlay"), fields: z.array(overlayField).max(250) }).strict(),
  z.object({ schema_version: schemaVersion, renderer_type: z.literal("generated_letter"), fields: z.array(z.never()).max(0) }).strict(),
]);

const templateBlock = z
  .object({
    id: z.string().trim().min(1).max(100),
    type: z.enum(["heading", "address", "paragraph", "bullet_list", "notice", "spacer", "divider", "signature", "page_break"]),
    text: z.string().max(20_000).optional(),
    lines: z.array(z.string().max(5_000)).max(100).optional(),
    items: z.array(z.string().max(5_000)).max(100).optional(),
    omit_empty_lines: z.boolean().optional(),
    include_when_present: placeholderPath.optional(),
    locked: z.boolean(),
  })
  .strict()
  .superRefine((block, context) => {
    if (["heading", "paragraph", "notice"].includes(block.type) && !block.text) {
      context.addIssue({ code: "custom", path: ["text"], message: `${block.type} blocks require text.` });
    }
    if (["address", "signature"].includes(block.type) && (!block.lines || block.lines.length === 0)) {
      context.addIssue({ code: "custom", path: ["lines"], message: `${block.type} blocks require lines.` });
    }
    if (block.type === "bullet_list" && (!block.items || block.items.length === 0)) {
      context.addIssue({ code: "custom", path: ["items"], message: "Bullet lists require items." });
    }
  });

export const templateSchema = z
  .object({
    schema_version: schemaVersion,
    document_title: z.string().trim().min(1).max(250).optional(),
    blocks: z.array(templateBlock).max(250),
  })
  .strict();

const validationRule = z
  .object({
    path: placeholderPath,
    other_path: placeholderPath.optional(),
    type: z.enum(["required", "string_length", "email", "date", "date_order", "number_range", "boolean_true"]),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    severity: z.enum(["warning", "error"]),
    message: z.string().trim().min(1).max(500),
  })
  .strict();

export const validationSchema = z
  .object({
    schema_version: schemaVersion,
    required_paths: z.array(placeholderPath).max(100),
    rules: z.array(validationRule).max(250),
    scope_warnings: z
      .object({
        maximum_date_span_days: z.number().int().positive().max(36_500).optional(),
        maximum_record_labels: z.number().int().positive().max(100).optional(),
        broad_mode_confirmation: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const outputOptionsSchema = z
  .object({
    schema_version: schemaVersion,
    flatten_acroform: z.literal(false),
    preserve_source_metadata: z.literal(false),
    pdf_title_pattern: z.string().trim().min(1).max(250),
    filename_pattern: z.string().trim().min(1).max(250),
    page_size: z.enum(["LETTER"]),
    margin_points: z.number().finite().min(0).max(144),
    default_font_key: z.string().trim().min(1).max(100),
    minimum_font_size: z.number().finite().min(4).max(20),
    show_page_numbers: z.boolean(),
    allow_continuation: z.boolean(),
  })
  .strict();

// Shared by every renderer type — factored out so the pdf/online_portal
// branches below can't drift apart on these common columns.
const commonProfileFields = {
  id: z.string().uuid(),
  government_entity_id: entityIdSchema,
  version: z.number().int().min(1),
  schema_version: schemaVersion,
  status: z.enum(["draft", "in_review", "verified", "retired"]),
  effective_from: z.iso.date().nullable(),
  effective_to: z.iso.date().nullable(),
  policy_source_url: z.string().url().max(2048),
  archived_policy_object_id: z.string().uuid().nullable(),
  policy_summary: z.string().max(10_000).nullable(),
  eligibility_mode: z.enum(["not_stated", "residency_required", "citizenship_required", "conditional", "other", "unknown"]),
  eligibility_jurisdiction: z.string().trim().max(100).nullable(),
  eligibility_explanation: z.string().max(10_000).nullable(),
  form_explanation: z.string().max(10_000).nullable(),
  fee_rule: z.string().max(10_000).nullable(),
  aggregation_rule: z.string().max(10_000).nullable(),
  submission_instructions: z.string().max(20_000).nullable(),
  verified_by: z.string().uuid().nullable(),
  verified_at: z.iso.datetime({ offset: true }).nullable(),
};

function superviseCommonInvariants(
  profile: { status: string; verified_by: string | null; verified_at: string | null; effective_from: string | null; effective_to: string | null },
  context: z.RefinementCtx,
): void {
  if (profile.status === "verified" && (!profile.verified_by || !profile.verified_at)) {
    context.addIssue({ code: "custom", path: ["verified_at"], message: "Verified profiles require verifier metadata." });
  }
  if (profile.effective_from && profile.effective_to && profile.effective_from > profile.effective_to) {
    context.addIssue({ code: "custom", path: ["effective_to"], message: "The effective date range is inverted." });
  }
}

export const pdfRequestProfileSchema = z
  .object({
    ...commonProfileFields,
    form_mode: z.enum(["not_required", "optional", "required", "portal_only", "unknown"]),
    template_family: z.enum(["municipal_form", "municipal_letter", "tennessee_model"]),
    renderer_type: z.enum(["acroform", "overlay", "generated_letter"]),
    base_pdf_object_id: z.string().uuid().nullable(),
    continuation_profile_id: z.string().uuid().nullable(),
    field_schema: fieldSchema,
    template_schema: templateSchema,
    validation_schema: validationSchema,
    output_options: outputOptionsSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    if (profile.field_schema.renderer_type !== profile.renderer_type) {
      context.addIssue({ code: "custom", path: ["field_schema", "renderer_type"], message: "Renderer types must match." });
    }
    const needsBasePdf = profile.renderer_type === "acroform" || profile.renderer_type === "overlay";
    if (needsBasePdf !== Boolean(profile.base_pdf_object_id)) {
      context.addIssue({ code: "custom", path: ["base_pdf_object_id"], message: "The base PDF does not match the renderer type." });
    }
    superviseCommonInvariants(profile, context);
  });

export type PdfRequestProfile = z.infer<typeof pdfRequestProfileSchema>;

// Online request portal — a plain-text profile carried by the same
// lifecycle RPCs (create/update/replace/activate/retire) but with none of
// the PDF machinery: no base PDF, no field mapping, no template blocks.
// Every shape below is a byte-for-byte match of what
// rrg_validate_online_portal_profile (supabase/migrations/20260922170741_online_portal_request_profiles.sql)
// actually compares against with `is distinct from` — these are not
// independently-invented client-side defaults, they are the literal values
// the database trigger requires or the request will be rejected server-side.
export const onlinePortalFieldSchema = z
  .object({ schema_version: schemaVersion, renderer_type: z.literal("online_portal"), fields: z.array(z.never()).max(0) })
  .strict();

// Mirrors the trigger's own regex: HTTPS host, no credentials/whitespace/
// backslashes/control characters, <=2048 characters. new URL() parsing is
// layered on top as the doc's required second, browser-native check.
const PORTAL_URL_PATTERN =
  /^https:\/\/[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^\s\\]*)?$/;

export const onlinePortalUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter the official request website URL.")
  .max(2048, "The portal URL must be 2048 characters or fewer.")
  .refine((value) => PORTAL_URL_PATTERN.test(value), {
    message: "Enter a valid HTTPS records-request portal URL without credentials or spaces.",
  })
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
      } catch {
        return false;
      }
    },
    { message: "Enter a valid HTTPS records-request portal URL without credentials or spaces." },
  );

export const onlinePortalTemplateSchema = z
  .object({
    schema_version: schemaVersion,
    portal_url: onlinePortalUrlSchema,
    request_text: z.string().max(12_000, "Default request language must be 12000 characters or fewer."),
  })
  .strict();

export const onlinePortalValidationSchema = z
  .object({
    schema_version: schemaVersion,
    required_paths: z.array(z.never()).max(0),
    rules: z.array(z.never()).max(0),
    scope_warnings: z.array(z.never()).max(0),
    broad_mode_confirmation: z.literal(false),
  })
  .strict();

export const onlinePortalOutputOptionsSchema = z.object({ schema_version: schemaVersion }).strict();

const onlinePortalProfileSchema = z
  .object({
    ...commonProfileFields,
    form_mode: z.literal("portal_only"),
    template_family: z.literal("online_portal"),
    renderer_type: z.literal("online_portal"),
    base_pdf_object_id: z.null(),
    continuation_profile_id: z.null(),
    field_schema: onlinePortalFieldSchema,
    template_schema: onlinePortalTemplateSchema,
    validation_schema: onlinePortalValidationSchema,
    output_options: onlinePortalOutputOptionsSchema,
  })
  .strict()
  .superRefine(superviseCommonInvariants);

export type OnlinePortalRequestProfile = z.infer<typeof onlinePortalProfileSchema>;

// A plain (non-discriminated) union rather than z.discriminatedUnion: the
// existing PDF branch's own renderer_type is itself a 3-value enum, not a
// single literal, so it can't be a discriminatedUnion member as-is without
// splitting it into three near-duplicate branches. Both sides are `.strict()`
// with disjoint renderer_type values, so a plain union still validates and
// rejects exactly as precisely — TypeScript narrowing on `renderer_type`
// downstream (readiness.ts, fill-payload-fields.ts) works identically either
// way.
export const requestProfileSchema = z.union([pdfRequestProfileSchema, onlinePortalProfileSchema]);

export type RequestProfile = z.infer<typeof requestProfileSchema>;

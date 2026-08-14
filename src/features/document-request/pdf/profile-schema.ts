import { z } from "zod";
import { allowedPlaceholderPaths } from "./request-data-schema";

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

export const requestProfileSchema = z
  .object({
    id: z.string().uuid(),
    government_entity_id: z.string().uuid(),
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
    form_mode: z.enum(["not_required", "optional", "required", "portal_only", "unknown"]),
    form_explanation: z.string().max(10_000).nullable(),
    fee_rule: z.string().max(10_000).nullable(),
    aggregation_rule: z.string().max(10_000).nullable(),
    submission_instructions: z.string().max(20_000).nullable(),
    template_family: z.enum(["municipal_form", "municipal_letter", "tennessee_model"]),
    renderer_type: z.enum(["acroform", "overlay", "generated_letter"]),
    base_pdf_object_id: z.string().uuid().nullable(),
    continuation_profile_id: z.string().uuid().nullable(),
    field_schema: fieldSchema,
    template_schema: templateSchema,
    validation_schema: validationSchema,
    output_options: outputOptionsSchema,
    verified_by: z.string().uuid().nullable(),
    verified_at: z.iso.datetime({ offset: true }).nullable(),
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
    if (profile.status === "verified" && (!profile.verified_by || !profile.verified_at)) {
      context.addIssue({ code: "custom", path: ["verified_at"], message: "Verified profiles require verifier metadata." });
    }
    if (profile.effective_from && profile.effective_to && profile.effective_from > profile.effective_to) {
      context.addIssue({ code: "custom", path: ["effective_to"], message: "The effective date range is inverted." });
    }
  });

export type RequestProfile = z.infer<typeof requestProfileSchema>;

import { z } from "zod";

const optionalTrimmed = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(1).max(maximum).optional(),
  );

export const requestDocumentDataSchema = z
  .object({
    government_entity: z
      .object({
        id: z.string().uuid(),
        legal_name: z.string().trim().min(1).max(250),
        display_name: z.string().trim().min(1).max(250),
        coordinator_name: optionalTrimmed(150),
        coordinator_title: optionalTrimmed(150),
        submission_email: z.string().trim().email().max(254).optional(),
        mailing_address: optionalTrimmed(500),
        portal_url: z.string().url().max(2048).optional(),
      })
      .strict(),
    request: z
      .object({
        goal_language: z.string().trim().min(1).max(4_000),
        records_description: z.string().trim().min(20).max(12_000),
        vendor_or_system: optionalTrimmed(200),
        department_or_division: optionalTrimmed(200),
        record_category_label: optionalTrimmed(200),
        date_from: z.iso.date().optional(),
        date_to: z.iso.date().optional(),
        delivery_method: z.enum(["electronic", "inspection", "paper"]),
      })
      .strict()
      .superRefine((request, context) => {
        if (request.date_from && request.date_to && request.date_from > request.date_to) {
          context.addIssue({
            code: "custom",
            path: ["date_to"],
            message: "The end date must not precede the start date.",
          });
        }
      }),
    profile: z
      .object({
        id: z.string().uuid(),
        version: z.number().int().min(1),
        government_entity_id: z.string().uuid(),
      })
      .strict(),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.profile.government_entity_id !== data.government_entity.id) {
      context.addIssue({
        code: "custom",
        path: ["profile", "government_entity_id"],
        message: "The request profile does not belong to the selected government entity.",
      });
    }
  });

export type RequestDocumentData = z.infer<typeof requestDocumentDataSchema>;

export const allowedPlaceholderPaths = [
  "government_entity.legal_name",
  "government_entity.display_name",
  "government_entity.coordinator_name",
  "government_entity.coordinator_title",
  "government_entity.submission_email",
  "government_entity.mailing_address",
  "request.goal_language",
  "request.records_description",
  "request.vendor_or_system",
  "request.department_or_division",
  "request.record_category_label",
  "request.date_from",
  "request.date_to",
  "request.date_from_mm_dd_yyyy",
  "request.date_to_mm_dd_yyyy",
  "request.delivery_method",
] as const;

export type AllowedPlaceholderPath = (typeof allowedPlaceholderPaths)[number];

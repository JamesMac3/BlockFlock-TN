import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import type { RenderWarning } from "./template-resolver";
import type { SupabaseStorageOnlyClient, TemplateSource } from "./supabase-template-loader";

/**
 * Authorized-operator counterpart to generate-request-document.ts. Reuses
 * the exact same renderers, template resolver, and output validator — the
 * only differences are: (1) it is told to allow (and require) a draft
 * profile via resolveAndRenderTemplate's allowDraftProfile option, and (2) it
 * loads the base PDF from evidence metadata already resolved by the
 * authorized get_draft_request_preview_bundle RPC, instead of the public
 * get_public_request_template_source RPC (which only returns
 * published/verified evidence and would refuse a draft profile's file).
 *
 * Only ever reached via dynamic import from the operator-preview UI, so
 * pdf-lib/@react-pdf/renderer/pdfjs never load for a visitor who never
 * triggers a preview.
 */

export type GeneratedOperatorPreviewDocument = Readonly<{
  blob: Blob;
  filename: string;
  pageCount: number;
  warnings: readonly RenderWarning[];
}>;

export async function generateOperatorPreviewDocument(
  profile: RequestProfile,
  data: RequestDocumentData,
  dependencies: Readonly<{ supabase: SupabaseStorageOnlyClient; evidence: TemplateSource | null }>,
): Promise<GeneratedOperatorPreviewDocument> {
  const [
    { createAcroformRenderer },
    { createOverlayRenderer },
    { createLetterRenderer },
    { createOperatorPreviewTemplateLoader },
    { resolveAndRenderTemplate },
    { validateRenderedOutput, inspectWithPdfJs },
  ] = await Promise.all([
    import("./acroform-renderer"),
    import("./overlay-renderer"),
    import("./letter-renderer"),
    import("./supabase-template-loader"),
    import("./template-resolver"),
    import("./output-validator"),
  ]);

  const loadBasePdf = dependencies.evidence
    ? createOperatorPreviewTemplateLoader(dependencies.evidence, dependencies.supabase)
    : async () => {
        throw new Error("No base PDF evidence is available for this profile.");
      };

  const renderers = {
    acroform: createAcroformRenderer({ loadBasePdf }),
    overlay: createOverlayRenderer({ loadBasePdf }),
    generated_letter: createLetterRenderer(),
  };

  const rendered = await resolveAndRenderTemplate(profile, data, renderers, { allowDraftProfile: true });
  const validated = await validateRenderedOutput(rendered, profile, data, { inspectPdf: inspectWithPdfJs });

  return {
    blob: new Blob([new Uint8Array(validated.pdfBytes)], { type: "application/pdf" }),
    filename: validated.filename,
    pageCount: validated.pageCount,
    warnings: validated.warnings,
  };
}

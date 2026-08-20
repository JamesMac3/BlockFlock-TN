import type { RequestProfile } from "./profile-schema";
import type { RequestDocumentData } from "./request-data-schema";
import type { RenderWarning } from "./template-resolver";
import type { SupabaseTemplateClient } from "./supabase-template-loader";

/**
 * Production browser-generator orchestration. Composes the template
 * resolver, all three renderers, the Supabase template loader, and the
 * output validator into one call. This module is only ever reached through
 * a dynamic import (see RecordsRequestGoalsTiers.jsx), so pdf-lib,
 * @react-pdf/renderer, and pdfjs-dist never load until a visitor actually
 * clicks "Prepare Request Form" on a generator-ready goal.
 *
 * Accepts only an already-verified, already-validated profile and request
 * data (see readiness.ts) — it performs no adaptation of its own beyond
 * what resolveAndRenderTemplate and validateRenderedOutput already
 * structurally re-check. It never falls back to a mock renderer or a
 * different jurisdiction's profile.
 */

export type GeneratedRequestDocument = Readonly<{
  blob: Blob;
  filename: string;
  pageCount: number;
  warnings: readonly RenderWarning[];
}>;

export async function generateRequestDocument(
  profile: RequestProfile,
  data: RequestDocumentData,
  dependencies: Readonly<{ supabase: SupabaseTemplateClient }>,
): Promise<GeneratedRequestDocument> {
  const [
    { createAcroformRenderer },
    { createOverlayRenderer },
    { createLetterRenderer },
    { createSupabaseTemplateLoader },
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

  const loadBasePdf = createSupabaseTemplateLoader(dependencies.supabase);

  const renderers = {
    acroform: createAcroformRenderer({ loadBasePdf }),
    overlay: createOverlayRenderer({ loadBasePdf }),
    generated_letter: createLetterRenderer(),
  };

  const rendered = await resolveAndRenderTemplate(profile, data, renderers);
  const validated = await validateRenderedOutput(rendered, profile, data, { inspectPdf: inspectWithPdfJs });

  return {
    blob: new Blob([new Uint8Array(validated.pdfBytes)], { type: "application/pdf" }),
    filename: validated.filename,
    pageCount: validated.pageCount,
    warnings: validated.warnings,
  };
}

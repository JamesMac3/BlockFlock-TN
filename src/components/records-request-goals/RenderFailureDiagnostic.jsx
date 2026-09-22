import { useState } from "react";
import "./RenderFailureDiagnostic.css";

/**
 * Shared between the public "Prepare Request Form" path
 * (RecordsRequestGoalsTiers.jsx) and the operator preview path
 * (OperatorDraftPreviewButton.jsx) so the two never drift apart on how a
 * PDF-verification failure is surfaced — see the "same explanation
 * pipeline" comment in RecordsRequestGoalsTiers.jsx.
 *
 * Renders nothing unless explainRenderFailure (render-failure-explanations.ts)
 * classified the failure as "verification_failed" — a failure to open or
 * inspect the already-generated PDF in this browser (e.g. the Safari
 * ReadableStream-async-iteration gap: https://github.com/mozilla/pdf.js/issues/20973),
 * distinct from a genuine template hash/size mismatch or detected
 * corruption, which keep their existing plain-text rendering unchanged.
 *
 * Only ever displays what explainRenderFailure already decided is safe: a
 * stable diagnostic code and a short stage label. Never the raw exception,
 * request content, personal information, a token, or an internal URL — see
 * render-failure-explanations.ts's own module comment for that guarantee.
 */
export default function RenderFailureDiagnostic({ explanation }) {
  const [copied, setCopied] = useState(false);

  if (!explanation || explanation.category !== "verification_failed") return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(explanation.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable or permission denied — the code is
      // still shown below as plain, selectable text either way.
    }
  }

  return (
    <div className="render-failure-diagnostic">
      <span className="render-failure-diagnostic__stage">Stage: {explanation.stage ?? "Unknown"}</span>
      <code className="render-failure-diagnostic__code">{explanation.code}</code>
      <button type="button" className="render-failure-diagnostic__copy" onClick={handleCopy}>
        {copied ? "Copied" : "Copy diagnostic code"}
      </button>
    </div>
  );
}

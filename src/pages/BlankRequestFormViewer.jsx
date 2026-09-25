import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import Header from "../components/Header";
import PdfPreview from "../components/pdf/PdfPreview";
import { supabase } from "../lib/supabase";
import {
  BLANK_FORMS_RPC,
  blankFormUrls,
  classifyBlankFormLookupError,
  isEvidenceId,
} from "../features/document-request/blankRequestForms";
import "./ArchiveDocumentViewer.css";

const BACK_TO_LIST = "/archive?tab=forms";

// Detail page for one public blank request form. Resolved server-side from
// the evidence id alone via get_public_blank_request_forms({ p_evidence_id })
// — never get_public_archive_document, which requires goal links these
// independent templates don't have. PDF rendering goes through the shared
// PdfPreview, so the Safari text-stream and PDF.js decoder fixes apply here
// unchanged.
export default function BlankRequestFormViewer() {
  const { evidenceId = "" } = useParams();
  const [state, setState] = useState({ phase: "loading", form: null, urls: null });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;

    async function loadForm() {
      if (!isEvidenceId(evidenceId)) {
        setState({ phase: "not-found", form: null, urls: null });
        return;
      }

      setState({ phase: "loading", form: null, urls: null });
      const { data, error } = await supabase.rpc(BLANK_FORMS_RPC, { p_evidence_id: evidenceId });
      if (!active) return;

      if (error) {
        console.error("Blank request form lookup failed:", error);
        setState({ phase: classifyBlankFormLookupError(error), form: null, urls: null });
        return;
      }

      const form = Array.isArray(data) ? data[0] : null;
      if (!form) {
        setState({ phase: "not-found", form: null, urls: null });
        return;
      }

      const urls = blankFormUrls(supabase.storage, form);
      setState(urls ? { phase: "ready", form, urls } : { phase: "unavailable", form, urls: null });
    }

    const timer = setTimeout(loadForm, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [evidenceId, attempt]);

  let content;

  if (state.phase === "loading") {
    content = (
      <div className="archive-document-viewer__message" role="status">
        <h1>Loading…</h1>
      </div>
    );
  } else if (state.phase === "error") {
    content = (
      <div className="archive-document-viewer__message" role="alert">
        <h1>Could not load this form</h1>
        <p>The request form could not be loaded right now.</p>
        <div className="archive-document-viewer__actions archive-document-viewer__actions--center">
          <button type="button" className="archive-document-viewer__action archive-document-viewer__action--primary" onClick={retry}>
            Try again
          </button>
          <Link to={BACK_TO_LIST} className="archive-document-viewer__action">Back to blank request forms</Link>
        </div>
      </div>
    );
  } else if (state.phase === "unavailable") {
    content = (
      <div className="archive-document-viewer__message" role="alert">
        <h1>{state.form.title}</h1>
        <p>This form's file is not available right now.</p>
        <div className="archive-document-viewer__actions archive-document-viewer__actions--center">
          <Link to={BACK_TO_LIST} className="archive-document-viewer__action">Back to blank request forms</Link>
        </div>
      </div>
    );
  } else if (state.phase === "not-found") {
    content = (
      <div className="archive-document-viewer__message">
        <h1>Form not found</h1>
        <p>We could not find a public blank request form at this address.</p>
        <div className="archive-document-viewer__actions archive-document-viewer__actions--center">
          <Link to={BACK_TO_LIST} className="archive-document-viewer__action">Back to blank request forms</Link>
        </div>
      </div>
    );
  } else {
    const { form, urls } = state;
    content = (
      <>
        <header className="archive-document-viewer__header">
          <Link to={BACK_TO_LIST} className="archive-document-viewer__back">← Blank request forms</Link>
          <span className="archive-document-viewer__category">Blank request form</span>
          <h1>{form.title}</h1>
          <p className="archive-document-viewer__meta">
            {[form.government_entity, form.county].filter(Boolean).join(" · ")}
          </p>

          <div className="archive-document-viewer__actions">
            <a
              href={urls.viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="archive-document-viewer__action archive-document-viewer__action--primary"
            >
              Open PDF
            </a>
            <a href={urls.downloadUrl} className="archive-document-viewer__action">
              Download PDF
            </a>
          </div>
        </header>

        <div className="archive-document-viewer__viewer archive-document-viewer__viewer--pdf">
          <PdfPreview source={{ kind: "url", url: urls.viewUrl }} title={form.title} />
        </div>
      </>
    );
  }

  return (
    <div className="site-shell">
      <Header />
      <main className="archive-document-viewer">
        <div className="archive-document-viewer__inner">{content}</div>
      </main>
      <Footer />
    </div>
  );
}

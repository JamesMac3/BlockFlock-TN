import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { supabase } from "../lib/supabase";
import { isInlineViewable, friendlyDownloadFilename } from "../features/portal-admin/archiveDocumentType";
import PdfPreview from "../components/pdf/PdfPreview";
import "./ArchiveDocumentViewer.css";

// Bucket/path are resolved server-side from evidenceId alone via
// get_public_archive_document — never accepted from a query parameter.
// A missing/unpublished/quarantined/unlinked document returns no row and
// is rendered identically to an unknown id: "Document not found," with no
// differentiated reason that could leak why it failed.
export default function ArchiveDocumentViewer() {
  const { evidenceId = "" } = useParams();
  const [state, setState] = useState({ phase: "loading", document: null, url: null });

  useEffect(() => {
    let active = true;

    async function loadDocument() {
      if (!evidenceId) {
        setState({ phase: "not-found", document: null, url: null });
        return;
      }

      setState({ phase: "loading", document: null, url: null });

      const { data, error } = await supabase
        .rpc("get_public_archive_document", { p_evidence_id: evidenceId })
        .maybeSingle();

      if (!active) return;

      if (error || !data) {
        setState({ phase: "not-found", document: null, url: null });
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(data.storage_bucket)
        .getPublicUrl(data.storage_path);

      setState({ phase: "ready", document: data, url: publicUrlData?.publicUrl ?? null });
    }

    loadDocument();

    return () => {
      active = false;
    };
  }, [evidenceId]);

  let content;

  if (state.phase === "loading") {
    content = (
      <div className="archive-document-viewer__message">
        <h1>Loading…</h1>
      </div>
    );
  } else if (state.phase === "not-found" || !state.url) {
    content = (
      <div className="archive-document-viewer__message">
        <h1>Document not found</h1>
        <p>We could not find a public archive document at this address.</p>
      </div>
    );
  } else {
    const { document: doc, url } = state;
    const downloadFilename = friendlyDownloadFilename(doc.title, doc.mime_type);
    const inline = isInlineViewable(doc.mime_type);

    content = (
      <>
        <header className="archive-document-viewer__header">
          <span className="archive-document-viewer__category">{doc.document_type}</span>
          <h1>{doc.title}</h1>
          <p className="archive-document-viewer__meta">
            {doc.government_entity} · {doc.county}
          </p>

          <div className="archive-document-viewer__actions">
            {inline && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="archive-document-viewer__action archive-document-viewer__action--primary"
              >
                Open
              </a>
            )}
            <a href={url} download={downloadFilename} className="archive-document-viewer__action">
              Download
            </a>
          </div>
        </header>

        {doc.mime_type === "application/pdf" ? (
          <div className="archive-document-viewer__viewer archive-document-viewer__viewer--pdf">
            <PdfPreview source={{ kind: "url", url }} title={doc.title} />
          </div>
        ) : inline ? (
          <div className="archive-document-viewer__viewer">
            <iframe title={doc.title} src={url} />
          </div>
        ) : (
          <div className="archive-document-viewer__unsupported">
            <p>This file type cannot be previewed in the browser. Use the download link above.</p>
          </div>
        )}
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

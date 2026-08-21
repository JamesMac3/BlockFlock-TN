import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { usePortalAuth } from "../auth/portalAuth";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { supabase } from "../lib/supabase";
import { classifyRpcError, RPC_ERROR_MESSAGES } from "../features/portal-admin/rpcErrors";
import { isInlineViewable, friendlyDownloadFilename } from "../features/portal-admin/archiveDocumentType";
import "./ArchiveDocumentViewer.css";

// Authenticated counterpart to the public /archive/documents/:evidenceId
// viewer — reachable by any active portal account (admin or chapter
// master; server-side county authorization is the real gate, enforced by
// rrg_get_document_for_portal itself), and able to show a document
// regardless of its current public/published/linked state, unlike the
// public route which stays gated to public+published only.
export default function PortalDocumentViewer() {
  const { evidenceId = "" } = useParams();
  const { authenticated, loading: authLoading } = usePortalAuth();
  const [state, setState] = useState({ phase: "loading", document: null, url: null, errorKind: null });

  useEffect(() => {
    if (!authenticated) return undefined;
    let active = true;

    async function loadDocument() {
      setState({ phase: "loading", document: null, url: null, errorKind: null });
      const { data, error } = await supabase
        .rpc("rrg_get_document_for_portal", { p_evidence_id: evidenceId })
        .maybeSingle();

      if (!active) return;

      if (error) {
        setState({ phase: "error", document: null, url: null, errorKind: classifyRpcError(error) });
        return;
      }
      if (!data) {
        setState({ phase: "not-found", document: null, url: null, errorKind: null });
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(data.storage_bucket)
        .getPublicUrl(data.storage_path);

      setState({ phase: "ready", document: data, url: publicUrlData?.publicUrl ?? null, errorKind: null });
    }

    loadDocument();
    return () => { active = false; };
  }, [evidenceId, authenticated]);

  if (authLoading) {
    return <p className="portal-route-status">Restoring secure session...</p>;
  }
  if (!authenticated) {
    return <Navigate to="/portal/login" replace />;
  }

  let content;
  if (state.phase === "loading") {
    content = <div className="archive-document-viewer__message"><h1>Loading…</h1></div>;
  } else if (state.phase === "error") {
    content = (
      <div className="archive-document-viewer__message">
        <h1>Document unavailable</h1>
        <p>{RPC_ERROR_MESSAGES[state.errorKind] ?? RPC_ERROR_MESSAGES.network}</p>
      </div>
    );
  } else if (state.phase === "not-found" || !state.url) {
    content = (
      <div className="archive-document-viewer__message">
        <h1>Document not found</h1>
        <p>This document does not exist, or you are not authorized to view it.</p>
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
              <a href={url} target="_blank" rel="noopener noreferrer" className="archive-document-viewer__action archive-document-viewer__action--primary">
                Open
              </a>
            )}
            <a href={url} download={downloadFilename} className="archive-document-viewer__action">
              Download
            </a>
          </div>
        </header>

        {inline ? (
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

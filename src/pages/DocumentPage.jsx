import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { supabase } from "../lib/supabase";
import { getDocumentCategoryLabel, getDocumentEntry } from "../config/documentManifest";
import { resolveDownloadOutcome } from "./documentDownloadOutcome";
import PdfPreview from "../components/pdf/PdfPreview";
import "./DocumentPage.css";

export default function DocumentPage() {
  const { documentSlug = "" } = useParams();
  const entry = useMemo(() => getDocumentEntry(documentSlug), [documentSlug]);
  const [state, setState] = useState({ phase: "loading", objectUrl: null, failed: false });

  useEffect(() => {
    if (!entry) return;

    let active = true;
    let createdUrl = null;

    async function loadDocument() {
      setState({ phase: "loading", objectUrl: null, failed: false });

      // Only ever fetches the fixed bucket/path pair from the manifest
      // entry resolved above — never anything derived from the URL beyond
      // the slug lookup itself.
      const { data, error } = await supabase.storage.from(entry.bucket).download(entry.objectPath);
      const succeeded = !error && Boolean(data);

      if (!succeeded) {
        console.error("Document download failed:", error?.message ?? "no data returned");
        const outcome = resolveDownloadOutcome({ succeeded: false, active });
        if (outcome.updateState) setState({ phase: "done", objectUrl: null, failed: true });
        return;
      }

      // The object URL is only ever created here, after a successful
      // download, never during render/useMemo. If the route changed or the
      // component unmounted while the download was in flight, revoke it
      // immediately instead of adopting it into state.
      const url = URL.createObjectURL(data);
      const outcome = resolveDownloadOutcome({ succeeded: true, active });

      if (outcome.revokeUrl) {
        URL.revokeObjectURL(url);
        return;
      }

      createdUrl = url;
      if (outcome.updateState) setState({ phase: "done", objectUrl: url, failed: false });
    }

    loadDocument();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
        createdUrl = null;
      }
    };
  }, [entry]);

  const { objectUrl } = state;

  let content;

  if (!entry) {
    content = (
      <div className="document-page__message">
        <h1>Document not found</h1>
        <p>We could not find a FlockBlock document at this address.</p>
      </div>
    );
  } else if (state.phase === "loading") {
    content = (
      <div className="document-page__message">
        <h1>{entry.title}</h1>
        <p>Loading document…</p>
      </div>
    );
  } else if (state.failed || !objectUrl) {
    content = (
      <div className="document-page__message">
        <h1>{entry.title}</h1>
        <p>This document is not available right now. Please try again later.</p>
      </div>
    );
  } else {
    content = (
      <>
        <header className="document-page__header">
          <span className="document-page__category">{getDocumentCategoryLabel(entry.category)}</span>
          <h1>{entry.title}</h1>
          {entry.governmentEntity && (
            <p className="document-page__entity">{entry.governmentEntity}</p>
          )}

          <div className="document-page__actions">
            <a
              href={objectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="document-page__action document-page__action--primary"
            >
              Open PDF
            </a>
            <a
              href={objectUrl}
              download={entry.downloadFilename}
              className="document-page__action"
            >
              Download PDF
            </a>
          </div>
        </header>

        <div className="document-page__viewer">
          <PdfPreview source={{ kind: "url", url: objectUrl }} title={entry.title} />
        </div>
      </>
    );
  }

  return (
    <div className="site-shell">
      <Header />
      <main className="document-page">
        <div className="document-page__inner">{content}</div>
      </main>
      <Footer />
    </div>
  );
}

import { useEffect, useState } from "react";
import Footer from "../components/Footer";
import Header from "../components/Header";
import ArchiveEntryCard from "../components/archive/ArchiveEntryCard";
import { supabase } from "../lib/supabase";
import "./ArchivePage.css";

const INITIAL_STATE = {
  phase: "loading",
  jurisdictions: [],
  failed: false,
};

export default function ArchivePage() {
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    let active = true;

    async function loadArchive() {
      const now = new Date().toISOString();

      // Read-only first pass: no dedicated archive table exists yet, so
      // published request templates are sourced from request_profiles and
      // grouped by their government_entities jurisdiction.
      const { data: profiles, error: profilesError } = await supabase
        .from("request_profiles")
        .select(
          "id, government_entity_id, version, template_family, renderer_type, policy_summary, base_pdf_object_id, effective_from, effective_to, status"
        )
        .eq("status", "verified")
        .lte("effective_from", now)
        .or(`effective_to.is.null,effective_to.gte.${now}`)
        .order("version", { ascending: false });

      if (!active) return;

      if (profilesError) {
        console.error("Archive request profiles failed:", profilesError);
        setState({ phase: "done", jurisdictions: [], failed: true });
        return;
      }

      const activeProfiles = profiles ?? [];

      if (activeProfiles.length === 0) {
        setState({ phase: "done", jurisdictions: [], failed: false });
        return;
      }

      const entityIds = [...new Set(activeProfiles.map((profile) => profile.government_entity_id))];
      const objectIds = [
        ...new Set(activeProfiles.map((profile) => profile.base_pdf_object_id).filter(Boolean)),
      ];

      const [entitiesResult, evidenceResult] = await Promise.all([
        supabase
          .from("government_entities")
          .select("id, display_name, legal_name")
          .in("id", entityIds),
        objectIds.length > 0
          ? supabase
              .from("evidence_objects")
              .select("id, status, visibility, storage_bucket, storage_path")
              .in("id", objectIds)
              .eq("status", "published")
              .eq("visibility", "public")
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!active) return;

      if (entitiesResult.error) {
        console.error("Archive government entities failed:", entitiesResult.error);
        setState({ phase: "done", jurisdictions: [], failed: true });
        return;
      }

      if (evidenceResult.error) {
        console.error("Archive evidence objects failed:", evidenceResult.error);
      }

      const entitiesById = Object.fromEntries(
        (entitiesResult.data ?? []).map((entity) => [entity.id, entity])
      );

      const evidenceById = Object.fromEntries(
        (evidenceResult.data ?? []).map((evidence) => [evidence.id, evidence])
      );

      const entries = activeProfiles
        .map((profile) => {
          const entity = entitiesById[profile.government_entity_id];
          if (!entity) return null;

          const evidence = profile.base_pdf_object_id
            ? evidenceById[profile.base_pdf_object_id]
            : null;

          const downloadUrl =
            evidence?.storage_bucket && evidence?.storage_path
              ? supabase.storage
                  .from(evidence.storage_bucket)
                  .getPublicUrl(evidence.storage_path).data.publicUrl
              : null;

          return { profile, entity, downloadUrl };
        })
        .filter(Boolean);

      const jurisdictionMap = new Map();
      for (const entry of entries) {
        const key = entry.entity.id;
        if (!jurisdictionMap.has(key)) {
          jurisdictionMap.set(key, { entity: entry.entity, entries: [] });
        }
        jurisdictionMap.get(key).entries.push(entry);
      }

      const jurisdictions = [...jurisdictionMap.values()].sort((a, b) =>
        (a.entity.display_name || a.entity.legal_name || "").localeCompare(
          b.entity.display_name || b.entity.legal_name || ""
        )
      );

      setState({ phase: "done", jurisdictions, failed: false });
    }

    loadArchive();
    return () => {
      active = false;
    };
  }, []);

  let content;

  if (state.phase === "loading") {
    content = (
      <div className="archive-message">
        <h1>Public Records Archive</h1>
        <p>Loading published request templates…</p>
      </div>
    );
  } else if (state.failed) {
    content = (
      <div className="archive-message">
        <h1>Public Records Archive</h1>
        <p>The archive could not be loaded. Please try again later.</p>
      </div>
    );
  } else {
    content = (
      <>
        <header className="archive-header">
          <h1>Public Records Archive</h1>
          <p className="archive-intro">
            Verified public-records request templates, grouped by the government
            jurisdiction that governs them.
          </p>
        </header>

        {state.jurisdictions.length === 0 ? (
          <div className="archive-empty">
            <p>No published request templates are available yet.</p>
          </div>
        ) : (
          state.jurisdictions.map((jurisdiction) => (
            <section
              key={jurisdiction.entity.id}
              className="archive-jurisdiction"
              aria-label={jurisdiction.entity.display_name || jurisdiction.entity.legal_name}
            >
              <h2 className="archive-jurisdiction__header">
                {jurisdiction.entity.display_name || jurisdiction.entity.legal_name}
              </h2>
              <div className="archive-jurisdiction__list">
                {jurisdiction.entries.map(({ profile, entity, downloadUrl }) => (
                  <ArchiveEntryCard
                    key={profile.id}
                    profile={profile}
                    entity={entity}
                    downloadUrl={downloadUrl}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </>
    );
  }

  return (
    <div className="site-shell">
      <Header />
      <main className="archive-page">
        <div className="archive-page__inner">{content}</div>
      </main>
      <Footer />
    </div>
  );
}

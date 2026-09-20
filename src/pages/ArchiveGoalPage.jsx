import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { supabase } from "../lib/supabase";
import "./ArchiveGoalPage.css";

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function ArchiveGoalPage() {
  const { goalId = "" } = useParams();
  const [state, setState] = useState({ phase: "loading", goal: null, countySlug: null });

  useEffect(() => {
    let active = true;

    async function loadGoal() {
      if (!goalId || Number.isNaN(Number(goalId))) {
        setState({ phase: "not-found", goal: null, countySlug: null });
        return;
      }

      setState({ phase: "loading", goal: null, countySlug: null });
      const { data, error } = await supabase.rpc("get_public_archive_goal", { p_goal_id: Number(goalId) });
      if (!active) return;
      if (error || !data) {
        setState({ phase: "not-found", goal: null, countySlug: null });
        return;
      }

      // get_public_archive_goal returns the county's name (not its slug),
      // so "Back to records request goals" resolves the slug from the
      // existing counties table by that exact same name — no schema or
      // RPC change needed, and no guessing at a name/slug format.
      const { data: countyRow } = await supabase
        .from("counties")
        .select("slug")
        .eq("name", data.county)
        .maybeSingle();
      if (!active) return;

      setState({ phase: "ready", goal: data, countySlug: countyRow?.slug ?? null });
    }

    loadGoal();

    return () => {
      active = false;
    };
  }, [goalId]);

  let content;

  if (state.phase === "loading") {
    content = <div className="archive-goal-page__message"><h1>Loading…</h1></div>;
  } else if (state.phase === "not-found") {
    content = (
      <div className="archive-goal-page__message">
        <h1>Goal not found</h1>
        <p>We could not find a public archive goal at this address.</p>
      </div>
    );
  } else {
    const { goal, countySlug } = state;
    // Resolving the slug can fail (e.g. a renamed/removed county) without
    // the goal lookup itself failing — the button still needs somewhere
    // real to go, so it falls back to the general county chooser rather
    // than disappearing or linking nowhere.
    const backHref = countySlug
      ? `/status/${countySlug}/records-request-goals?goal=${goal.id}`
      : "/status";
    content = (
      <>
        <header className="archive-goal-page__header">
          <div className="archive-goal-page__header-top">
            <span className={`archive-table__badge archive-table__badge--${goal.completion_state.toLowerCase()}`}>
              {goal.completion_state}
            </span>
            <Link to={backHref} className="archive-goal-page__back-link">
              ← Back to records request goals
            </Link>
          </div>
          <h1>{goal.title}</h1>
          <p className="archive-goal-page__meta">{goal.government_entity} · {goal.county}</p>
          {goal.public_summary && <p className="archive-goal-page__summary">{goal.public_summary}</p>}
        </header>

        <section aria-label="Records and Sources">
          <h2>Records and Sources</h2>
          {(!goal.resources || goal.resources.length === 0) ? (
            <p>No public records or sources have been added to this goal yet.</p>
          ) : (
            <ol className="archive-goal-page__resources">
              {goal.resources.map((resource, index) => (
                <li key={resource.link_id} className="archive-goal-page__resource">
                  <span className="archive-goal-page__resource-index">[{index + 1}]</span>
                  <div>
                    {resource.source_kind === "hosted" ? (
                      <Link to={`/archive/documents/${resource.evidence_id}`} className="archive-goal-page__resource-link">
                        {resource.label}
                      </Link>
                    ) : (
                      <a
                        href={resource.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="archive-goal-page__resource-link"
                      >
                        {resource.label} <span className="archive-goal-page__hostname">({hostnameOf(resource.external_url)})</span>
                      </a>
                    )}
                    {resource.document_type && <span className="archive-goal-page__type">{resource.document_type}</span>}
                    {resource.public_description && <p className="archive-goal-page__description">{resource.public_description}</p>}
                    <p className="archive-goal-page__provenance">
                      Uploaded by {resource.uploaded_by ?? "Not recorded"} · Reviewed by {resource.reviewed_by ?? "Not recorded"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </>
    );
  }

  return (
    <div className="site-shell">
      <Header />
      <main className="archive-goal-page">
        <div className="archive-goal-page__inner">{content}</div>
      </main>
      <Footer />
    </div>
  );
}

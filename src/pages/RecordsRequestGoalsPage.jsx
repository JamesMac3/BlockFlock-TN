import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Footer from "../components/Footer";
import Header from "../components/Header";
import CountyStatusChooser from "../components/CountyStatusChooser";
import RecordsRequestGoalsTiers from "../components/records-request-goals/RecordsRequestGoalsTiers";
import { formatCountyLabel } from "../features/document-request/countyLabel";
import { supabase } from "../lib/supabase";
import "./RecordsRequestGoalsPage.css";

const INITIAL_STATE = {
  slug: null,
  phase: "county",
  county: null,
  goals: [],
  notFound: false,
  failed: false,
};

export default function RecordsRequestGoalsPage() {
  const { countySlug = "" } = useParams();
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    let active = true;

    async function loadCountyGoals() {
      setState({ ...INITIAL_STATE, slug: countySlug });

      const { data: county, error: countyError } = await supabase
        .from("counties")
        .select("id, name, slug, chapter_contact_email")
        .eq("slug", countySlug)
        .maybeSingle();

      if (!active) return;

      if (countyError) {
        console.error("County request failed:", countyError);
        setState((current) => ({ ...current, phase: "done", failed: true }));
        return;
      }

      if (!county) {
        setState((current) => ({ ...current, phase: "done", notFound: true }));
        return;
      }

      setState((current) => ({ ...current, county, phase: "goals" }));

      // Fetch public records-request goals for this county
      const { data: goals, error: goalsError } = await supabase
        .from("county_records_request_goals")
        .select(
          `
          id,
          title,
          public_summary,
          status,
          position,
          tier,
          locked,
          locked_reason,
          fill_payload,
          request_profile_id,
          government_entity_id,
          records_request_goal_links(
            id,
            label,
            position,
            is_primary,
            evidence_object_id,
            external_url
          )
        `
        )
        .eq("county_id", county.id)
        .eq("is_public", true)
        .neq("status", "draft")
        .neq("status", "retired")
        .order("tier", { ascending: true })
        .order("position", { ascending: true })
        .order("id", { ascending: true });

      if (!active) return;

      if (goalsError) {
        console.error("Goals request failed:", goalsError);
        setState((current) => ({ ...current, phase: "done", failed: true }));
        return;
      }

      setState({
        slug: countySlug,
        phase: "done",
        county,
        goals: goals ?? [],
        notFound: false,
        failed: false,
      });
    }

    loadCountyGoals();
    return () => {
      active = false;
    };
  }, [countySlug]);

  const routeIsLoading = state.slug !== countySlug || state.phase === "county";

  let content;

  if (routeIsLoading) {
    content = (
      <StatusMessage
        title="Loading county"
        message="Finding this county's records-request goals…"
        currentCountySlug={countySlug}
      />
    );
  } else if (state.notFound) {
    content = (
      <StatusMessage
        title="County not found"
        message="We could not find a Tennessee county with that address."
        currentCountySlug={countySlug}
      />
    );
  } else if (state.failed) {
    content = (
      <StatusMessage
        title="Records request goals unavailable"
        message="The goals could not be loaded. Please try again later."
        currentCountySlug={state.county?.slug ?? countySlug}
      />
    );
  } else {
    const countyLabel = formatCountyLabel(state.county.name);
    content = (
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <header className="records-goals-header">
          <div>
            <CountyStatusChooser currentSlug={state.county.slug} />
            <h1>Records Request Roadmap</h1>
            <p className="records-goals-intro">
              View the status of records requests for {countyLabel}.
              These goals represent efforts to make important public records more
              accessible through transparent request timelines.
            </p>
          </div>
        </header>

        {state.goals && state.goals.length > 0 ? (
          <RecordsRequestGoalsTiers goals={state.goals} county={state.county} />
        ) : (
          <div className="records-goals-empty">
            <p>
              There are no public records-request goals for {countyLabel}
              at this time.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="site-shell">
      <Header />
      <main className="records-goals-page">
        <section className="records-goals-content">{content}</section>
      </main>
      <Footer />
    </div>
  );
}

function StatusMessage({ title, message, currentCountySlug }) {
  return (
    <main style={{ padding: "8rem 1.5rem 4rem" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <h1>{title}</h1>
        <p>{message}</p>
        <CountyStatusChooser currentSlug={currentCountySlug} />
      </div>
    </main>
  );
}

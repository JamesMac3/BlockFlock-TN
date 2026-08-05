import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import Header from "../components/Header";
import CountyStatusChooser from "../components/CountyStatusChooser";
import StatusPostCard from "../components/status/StatusPostCard";
import { ACTIVE_CHAPTER_COUNTY_SLUGS } from "../config/activeChapterCounties";
import { supabase } from "../lib/supabase";
import { sortStatusPosts } from "../utils/statusPostUtils";
import "./CountyStatusPage.css";

const INITIAL_STATE = {
  slug: null,
  phase: "county",
  county: null,
  posts: [],
  notFound: false,
  failed: false,
};

export default function CountyStatusPage() {
  const { countySlug = "" } = useParams();
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    let active = true;

    async function loadCountyStatus() {
      setState({ ...INITIAL_STATE, slug: countySlug });

      const { data: county, error: countyError } = await supabase
        .from("counties")
        .select("id, name, slug, camera_count, drone_count")
        .eq("slug", countySlug)
        .maybeSingle();

      if (!active) return;

      if (countyError) {
        console.error("County status request failed:", countyError);
        setState((current) => ({ ...current, phase: "done", failed: true }));
        return;
      }

      if (!county) {
        setState((current) => ({ ...current, phase: "done", notFound: true }));
        return;
      }

      setState((current) => ({ ...current, county, phase: "posts" }));

      const { data: posts, error: postsError } = await supabase
        .from("posts")
        .select(
          "id, county_id, title, body, body_rich, status, is_pinned, created_at, updated_at, approved_at, scope, content_type, summary, cover_image_path, cover_image_alt, event_start, event_location, event_address, show_in_status_feed, post_media(id, media_type, position, is_primary, storage_path, external_url, provider, provider_media_id, component_key, configuration, alt_text, caption, credit, source_url)"
        )
        .eq("status", "approved")
        .eq("show_in_status_feed", true)
        .or(`scope.eq.global,county_id.eq.${county.id}`);

      if (!active) return;

      if (postsError) {
        console.error("County status posts request failed:", postsError);
        setState((current) => ({ ...current, phase: "done", failed: true }));
        return;
      }

      setState({
        slug: countySlug,
        phase: "done",
        county,
        posts: sortStatusPosts(posts ?? [], county.id),
        notFound: false,
        failed: false,
      });
    }

    loadCountyStatus();
    return () => {
      active = false;
    };
  }, [countySlug]);

  const hasLocalPosts = useMemo(
    () => state.posts.some((post) => Number(post.county_id) === Number(state.county?.id)),
    [state.posts, state.county?.id]
  );
  const routeIsLoading = state.slug !== countySlug || state.phase === "county";

  let content;

  if (routeIsLoading) {
    content = <StatusMessage title="Loading county" message="Finding this county’s public status feed…" currentCountySlug={countySlug} />;
  } else if (state.notFound) {
    content = <StatusMessage title="County not found" message="We could not find a Tennessee county with that status-page address." currentCountySlug={countySlug} />;
  } else if (state.failed) {
    content = <StatusMessage title="Status feed unavailable" message="The public status feed could not be loaded. Please try again later." currentCountySlug={state.county?.slug ?? countySlug} />;
  } else if (state.phase === "posts") {
    content = <StatusMessage title="Loading updates" message={`Loading statewide and ${state.county.name} updates…`} currentCountySlug={state.county.slug} />;
  } else {
    content = (
      <>
        <CountyStatusHeader county={state.county} />

        {!ACTIVE_CHAPTER_COUNTY_SLUGS.has(state.county.slug) && (
          <ChapterClaimCallout county={state.county} />
        )}

        {!hasLocalPosts && (
          <p className="county-status-notice">
            No local updates have been published yet. Approved statewide notices are shown below.
          </p>
        )}

        {state.posts.length ? (
          <section className="status-post-grid" aria-label={`${state.county.name} public updates`}>
            {state.posts.map((post, index) => (
              <StatusPostCard
                key={post.id}
                post={post}
                countyName={state.county.name}
                eager={index < 2}
              />
            ))}
          </section>
        ) : (
          <StatusMessage
            title="No approved updates"
            message="No statewide or local updates have been published for this county yet."
            currentCountySlug={state.county.slug}
          />
        )}
      </>
    );
  }

  return (
    <div className="site-shell">
      <Header />
      <main className="county-status-page">
        <div className="county-status-page__inner">{content}</div>
      </main>
      <Footer />
    </div>
  );
}

function StatusMessage({ title, message, currentCountySlug }) {
  return (
    <section className="county-status-message" role="status">
      <h1>{title}</h1>
      <p>{message}</p>
      <CountyStatusChooser currentCountySlug={currentCountySlug} />
    </section>
  );
}

function ChapterClaimCallout({ county }) {
  return (
    <aside className="county-status-claim" aria-labelledby="county-status-claim-title">
      <div>
        <h2 id="county-status-claim-title">Start a chapter in {county.name}</h2>
        <p>
          Organize local records work, public education, and community action in your county.
        </p>
      </div>
      <Link to={`/chapters/claim?county=${encodeURIComponent(county.slug)}`}>
        Claim this chapter
      </Link>
    </aside>
  );
}

function CountyStatusHeader({ county }) {
  const hasActiveChapter = ACTIVE_CHAPTER_COUNTY_SLUGS.has(county.slug);

  return (
    <header className="county-status-header">
      <div className="county-status-header__title">
        <p>Public county status</p>
        <h1>{county.name}</h1>
        <span className={hasActiveChapter ? "is-active" : ""}>
          {hasActiveChapter ? "Active chapter" : "No publicly confirmed chapter"}
        </span>
      </div>

      <p className="county-status-header__intro">
        This feed combines approved statewide notices with public updates specific to {county.name}.
      </p>

      <dl className="county-status-stats">
        {county.camera_count !== null && county.camera_count !== undefined && (
          <div><dt>Documented cameras</dt><dd>{county.camera_count}</dd></div>
        )}
        {Number(county.drone_count) > 0 && (
          <div><dt>Documented drones</dt><dd>{county.drone_count}</dd></div>
        )}
      </dl>

      <CountyStatusChooser currentCountySlug={county.slug} />
    </header>
  );
}

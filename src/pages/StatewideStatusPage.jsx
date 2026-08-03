import { useEffect, useState } from "react";
import Footer from "../components/Footer";
import Header from "../components/Header";
import CountyStatusChooser from "../components/CountyStatusChooser";
import StatusPostCard from "../components/status/StatusPostCard";
import { supabase } from "../lib/supabase";
import { sortStatusPosts } from "../utils/statusPostUtils";
import "./CountyStatusPage.css";

const PUBLIC_POST_FIELDS = [
  "id",
  "county_id",
  "title",
  "body",
  "status",
  "is_pinned",
  "created_at",
  "updated_at",
  "approved_at",
  "scope",
  "content_type",
  "summary",
  "cover_image_path",
  "cover_image_alt",
  "event_start",
  "event_location",
  "event_address",
].join(", ");

export default function StatewideStatusPage() {
  const [state, setState] = useState({ loading: true, failed: false, posts: [] });

  useEffect(() => {
    let active = true;

    async function loadStatewidePosts() {
      const { data, error } = await supabase
        .from("posts")
        .select(PUBLIC_POST_FIELDS)
        .eq("status", "approved")
        .eq("scope", "global");

      if (!active) return;

      if (error) {
        console.error("Statewide status posts request failed:", error);
        setState({ loading: false, failed: true, posts: [] });
        return;
      }

      setState({
        loading: false,
        failed: false,
        posts: sortStatusPosts(data ?? [], null),
      });
    }

    loadStatewidePosts();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="site-shell">
      <Header />
      <main className="county-status-page">
        <div className="county-status-page__inner">
          <header className="county-status-header">
            <div className="county-status-header__title">
              <p>Public status</p>
              <h1>Tennessee</h1>
              <span>Statewide updates</span>
            </div>
            <p className="county-status-header__intro">
              Approved public notices, meetings, investigations, records, and action updates from across Tennessee.
            </p>
            <CountyStatusChooser />
          </header>

          {state.loading ? (
            <StatusMessage title="Loading statewide updates" />
          ) : state.failed ? (
            <StatusMessage title="Statewide updates are unavailable right now." />
          ) : state.posts.length ? (
            <section className="status-post-grid" aria-label="Tennessee statewide public updates">
              {state.posts.map((post, index) => (
                <StatusPostCard
                  key={post.id}
                  post={post}
                  countyName="Tennessee"
                  eager={index < 2}
                />
              ))}
            </section>
          ) : (
            <StatusMessage title="No approved statewide updates have been published yet." />
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StatusMessage({ title }) {
  return (
    <section className="county-status-message" role="status">
      <p>{title}</p>
    </section>
  );
}

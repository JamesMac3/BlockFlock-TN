import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import StatusPostCard from "../components/status/StatusPostCard";
import { supabase } from "../lib/supabase";
import "../components/admin/AdminPostDashboard.css";

export default function AdminPostPreview() {
  const { postId } = useParams();
  const [state, setState] = useState({ loading: true, post: null, error: "" });

  useEffect(() => {
    let active = true;
    async function loadPreview() {
      const { data, error } = await supabase
        .from("posts")
        .select("*, counties(id, name, slug), post_media(*)")
        .eq("id", postId)
        .single();
      if (!active) return;
      if (error || !data) {
        console.error("Draft preview request failed:", error);
        setState({ loading: false, post: null, error: "This saved post could not be previewed." });
      } else {
        setState({ loading: false, post: data, error: "" });
      }
    }
    loadPreview();
    return () => { active = false; };
  }, [postId]);

  return (
    <div className="site-shell">
      <Header />
      <main className="admin-preview-page">
        <div className="admin-preview-page__inner">
          <header className="admin-preview-banner">
            <div><p>Draft preview</p><h1>This update is not public.</h1></div>
            <div>
              <Link to="/portal/admin">Back to posts</Link>
              {state.post && <Link to={`/portal/admin/posts/${state.post.id}/edit`}>Edit draft</Link>}
            </div>
          </header>
          {state.loading && <p role="status">Loading saved preview...</p>}
          {state.error && <p className="composer-error" role="alert">{state.error}</p>}
          {state.post && <div className="admin-saved-preview"><StatusPostCard post={state.post} countyName={state.post.counties?.name ?? "Tennessee"} eager /></div>}
        </div>
      </main>
    </div>
  );
}

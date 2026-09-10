import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import "./EducationPage.css";
import InteractiveModule from "../components/education/InteractiveModule";
import TopicPager from "../components/education/TopicPager";
import {
  getAdjacentEducationTopics,
  getEducationTopicBySlug,
  getEducationTopics,
  getLegacyTopicRedirect,
} from "../data/education/registry";

export default function EducationPage() {
  const { topicSlug } = useParams();
  const topics = getEducationTopics();
  const activeTopic = topicSlug ? getEducationTopicBySlug(topicSlug) : undefined;

  useEffect(() => {
    if (activeTopic) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeTopic]);

  if (!activeTopic) {
    // A bookmarked/shared link to a standalone lesson that was folded into
    // one of the three field guides still lands on the guide that now
    // covers it, rather than silently landing on guide 1 like any other
    // unrecognized slug.
    const legacySlug = topicSlug ? getLegacyTopicRedirect(topicSlug) : undefined;
    return <Navigate to={`/education/${legacySlug ?? topics[0]?.slug}`} replace />;
  }

  const { previous, next } = getAdjacentEducationTopics(activeTopic.slug);

  return (
    <>
      <Header />

      <main className="education-page">

        {/* Hero Section */}

        <header className="education-header">

        </header>

        {/* Lesson Content */}

        <section className="education-layout">

          <div className="content-placeholder">
            <InteractiveModule module={activeTopic} />
            <TopicPager previous={previous} next={next} />
          </div>

        </section>

      </main>
    </>
  );
}

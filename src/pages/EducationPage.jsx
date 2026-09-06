import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import "./EducationPage.css";
import EducationSidebar from "../components/education/EducationSidebar";
import InteractiveModule from "../components/education/InteractiveModule";
import TopicPager from "../components/education/TopicPager";
import { getAdjacentEducationTopics, getEducationTopicBySlug, getEducationTopics } from "../data/education/registry";

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
    return <Navigate to={`/education/${topics[0]?.slug}`} replace />;
  }

  const { previous, next } = getAdjacentEducationTopics(activeTopic.slug);

  return (
    <>
      <Header />

      <main className="education-page">

        {/* Hero Section */}

        <header className="education-header">

        </header>

        {/* Documentation Layout */}

        <section className="education-layout">

          <EducationSidebar activeSlug={activeTopic.slug} />

          <section className="education-content">

            <div className="content-placeholder">
              <InteractiveModule module={activeTopic} />
              <TopicPager previous={previous} next={next} />
            </div>

          </section>

        </section>

      </main>
    </>
  );
}

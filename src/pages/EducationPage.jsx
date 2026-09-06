import { useEffect, useState } from "react";
import Header from "../components/Header";
import "./EducationPage.css";
import EducationSidebar from "../components/education/EducationSidebar";
import EducationEntryCards from "../components/education/EducationEntryCards";
import InteractiveModule from "../components/education/InteractiveModule";
import TopicPager from "../components/education/TopicPager";
import { getAdjacentEducationTopics, getEducationTopicBySlug, getEducationTopics } from "../data/education/registry";

function resolveInitialSlug() {
  const topics = getEducationTopics();
  const hashSlug = window.location.hash.replace("#", "");
  if (hashSlug && getEducationTopicBySlug(hashSlug)) {
    return hashSlug;
  }
  return topics[0]?.slug;
}

export default function EducationPage() {
  const [activeSlug, setActiveSlug] = useState(resolveInitialSlug);
  const activeTopic = getEducationTopicBySlug(activeSlug) ?? getEducationTopics()[0];
  const { previous, next } = getAdjacentEducationTopics(activeTopic?.slug);

  useEffect(() => {
    function handleHashChange() {
      const hashSlug = window.location.hash.replace("#", "");
      if (hashSlug && getEducationTopicBySlug(hashSlug)) {
        setActiveSlug(hashSlug);
      }
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  function handleSelectTopic(slug) {
    setActiveSlug(slug);
    window.history.replaceState(null, "", `#${slug}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <Header />

      <main className="education-page">

        {/* Hero Section */}

        <header className="education-header">

        </header>


          <EducationEntryCards />




        {/* Documentation Layout */}

        <section className="education-layout">

          <EducationSidebar activeSlug={activeSlug} onSelect={handleSelectTopic} />

          <section className="education-content">

            <div className="content-placeholder">
              <InteractiveModule module={activeTopic} />
              <TopicPager previous={previous} next={next} onSelect={handleSelectTopic} />
            </div>

          </section>

        </section>

      </main>
    </>
  );
}

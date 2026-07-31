import Header from "../components/Header";
import "./EducationPage.css";
import EducationSidebar from "../components/education/EducationSidebar";
import EducationSlideshow from "../components/education/EducationSlideshow";
import flockSafety from "../data/education/flockSafety"; 
import EducationTopic from "../components/education/EducationTopic";

export default function EducationPage() {
  return (
    <>
      <Header />

      <main className="education-page">

        {/* Hero Section */}

        <header className="education-header">
  
        </header>

       
          <EducationSlideshow />
        



        {/* Documentation Layout */}

        <section className="education-layout">

          <EducationSidebar />

          <section className="education-content">

            <div className="content-placeholder">
              <h2>Documentation</h2>
                <EducationTopic topic={flockSafety} />
              <p>
                Content Coming Soon
              </p>
            </div>

          </section>

        </section>

      </main>
    </>
  );
}
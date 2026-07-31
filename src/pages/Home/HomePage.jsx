import { useState } from "react";
import { Link } from "react-router-dom";
import Footer from "../../components/Footer";
import Header from "../../components/Header";
import InvestigationCard from "../../components/InvestigationCard";
import SectionHeading from "../../components/SectionHeading";
import "./HomePage.css";
import skyline from "../../assets/MTN_skyrise.jpg";
import TennesseeCountyMapContainer from "../../components/jurisdiction-map/TennesseeCountyMapContainer";

const investigations = [
  {
    number: "01",
    title: "Technology",
    description:
      "Explain what surveillance systems do, how they collect information, and how separate technologies may be connected.",
    topics: ["ALPR", "RTCC", "Drones", "Analytics"],
  },
  {
    number: "02",
    title: "Infrastructure",
    description:
      "Document the hardware, software, vendors, procurement methods, funding, communications, and data flows behind each deployment.",
    topics: ["Hardware", "Vendors", "Contracts", "Funding"],
  },
  {
    number: "03",
    title: "Governance",
    description:
      "Track policies, retention rules, sharing arrangements, audit controls, public votes, and the officials responsible for oversight.",
    topics: ["Policies", "Votes", "Retention", "Audits"],
  },
  {
    number: "04",
    title: "Public Records",
    description:
      "Organise contracts, meeting records, requests, timelines, source links, and archived evidence into a usable public record.",
    topics: ["TPRA", "Timelines", "Sources", "Archives"],
  },
];

export default function HomePage() {
  const [contactFormOpen, setContactFormOpen] = useState(false);

  return (
    <div className="site-shell">
      <Header />

      <main>
        <section className="hero">
          <div className="hero__background" aria-hidden="true">
    <img src={skyline} alt="" />
</div>

          <div className="container hero__content">
            <div className="hero__copy">
              <p className="eyebrow">The community that understands the dangers of indiscriminate surveillance.</p>

              <h1>
                Fighting the surveillance state across Tennessee.
              </h1>

              <p className="hero__description">
                Flock Block documents the surveillance technology infrastructure,
                tracks the governance and oversight, and shines a light on the evolving capabilities of surveillance systems in Tennessee. We intend to speak truth to power and to hold those accountable for the violations of privacy.
              </p>

              <div className="hero__actions">
<button
  className="button button--primary"
  type="button"
  onClick={() => setContactFormOpen(true)}
>
  Join Now
</button>

                <Link to="/education" className="button button--secondary">
                  Understand the surveillance
                </Link>
              </div>
            </div>

            <aside className="hero-panel" aria-label="Project principles">
              <p className="hero-panel__label">Accountability is coming.</p>

              <ul>
                <li>
                  <strong>Learn about violations of privacy.</strong>
                  <span>Understand the technology, governance, and implications of AI fusion surveillance systems.</span>
                </li>
                <li>
                  <strong>Build a strong case.</strong>
                  <span>Document abuses, concerns, and evidence to support and present that information to officials.</span>
                </li>
                <li>
                  <strong>Get invovled in the Action.</strong>
                  <span>Spread the message, advocate for change, show up at council meetings, and educate our lawmakers.</span>
                </li>
                <li>
                  <strong>Be thorough.</strong>
                  <span>Don't let one surveillance system replace another.</span>
                </li>
              </ul>
            </aside>
          </div>
        </section>

        <section className="trust-strip">
          <div className="container trust-strip__inner">
            <div>
              <strong>Get the information.</strong>
              <span>Request documents, educate yourself on new technology, and stay informed about developments.</span>
            </div>
            <div>
              <strong>Support the cause.</strong>
              <span>Request the records, speak to your officials and raise awareness.</span>
            </div>
            <div>
              <strong>Stop the spread.</strong>
              <span>Learn the methods needed to prevent the expansion of violating surveillance systems.</span>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <SectionHeading
              eyebrow="What Are We Fighting:"
              title="The complete surveillance system"
              description="The visible camera is only one part of a larger network. We examine the technology, infrastructure, governance, and records that establish how the system operates. To fully dismantle the surveillance state, we must understand how it works and ensure no loopholes are created to allow the system to continue operating."
            />

            <div className="investigation-grid">
              {investigations.map((item) => (
                <InvestigationCard key={item.number} {...item} />
              ))}
            </div>
          </div>
        </section>

       <section id="join-map" className="section section--muted">
  <div className="container">
    <SectionHeading
      eyebrow="Follow your jurisdiction and get involved in your local chapter"
      title="Surveillance deployment across Tennessee"
      description="Explore documented camera deployments by county. Darker red indicates a larger number of cameras identified through contracts, inventories, official disclosures, and public records."
    />
 <TennesseeCountyMapContainer
   contactFormOpen={contactFormOpen}
   onContactFormOpenChange={setContactFormOpen}
 />
  </div>
</section>

        <section className="section">
          <div className="container split-section">
            <div>
              <SectionHeading
                eyebrow="Education"
                title="Learn it. Verify it. Share it."
                description="The education library will convert technical findings and vendor claims into clear, reusable learning materials supported by primary sources."
              />

              <div className="feature-list">
                <article>
                  <h3>Technology explainers</h3>
                  <p>
                    Understand the dangers of ALPRs, real-time crime centres, video platforms,
                    drones, analytics, integrations, and data sharing.
                  </p>
                </article>

                <article>
                  <h3>Infrastructure research</h3>
                  <p>
                    Follow the hardware, vendors, installers, contracts,
                    purchasing routes, funding sources, and the data custody chain so you can identify who is responsible for the surveillance in your area and who to hold accountable.
                  </p>
                </article>

                <article>
                  <h3>Distributable materials</h3>
                  <p>
                    Speak with high confidence on the technology and clearly dictate the problems to your community and officials. It's not enough to complain; we must educate them.
                  </p>
                </article>
              </div>

              <Link to="/education" className="button button--dark">
                Visit education library
              </Link>
            </div>

            <div className="evidence-card">
              <p className="evidence-card__label">Evidence structure</p>

              <div className="evidence-step">
                <span>1</span>
                <div>
                  <strong>Claim</strong>
                  <p>A clear factual statement.</p>
                </div>
              </div>

              <div className="evidence-connector" />

              <div className="evidence-step">
                <span>2</span>
                <div>
                  <strong>Source</strong>
                  <p>The contract, vote, policy, statement, or public record.</p>
                </div>
              </div>

              <div className="evidence-connector" />

              <div className="evidence-step">
                <span>3</span>
                <div>
                  <strong>Context</strong>
                  <p>Providing counters to false claims of safety over liberty.</p>
                </div>
              </div>

              <div className="evidence-connector" />

              <div className="evidence-step">
                <span>4</span>
                <div>
                  <strong>Document</strong>
                  <p>Pooling evidence of abuses of indiscriminate surveillance activity, abuses and those responsible so they can be held accountable.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section section--dark">
          <div className="container outcome-callout">
            <div>
              <p className="eyebrow eyebrow--light">DO NOT TEAR DOWN THE CAMERAS or PERFORM ILLEGAL ACTIONS!</p>
              <h2>Tearing down the cameras will not produce change. It does nothing.  They are cheap and replaceable. You are not.</h2>
              <p>
                You must take your complaints to local officials and hold them accountable for the surveillance systems they have deployed. We will provide you with the information and tools to do so, so they remove not only the Flock cameras, but the entire surveillance network.
              </p>
            </div>

            <Link to="/strategies" className="button button--light">
              Explore outcome vectors
            </Link>
          </div>
        </section>

        <section className="section">
          <div className="container participation">
            <SectionHeading
              eyebrow="Participate"
              title="Help build the public record"
              description="Local chapters can collect sources, document public statements, meet with action teams to discuss the issues, educate themselves and get their local surveillance systems removed by legal means."
              align="center"
            />

            <div className="participation__actions">
              <Link to="/about" className="button button--primary">
                Learn about the project
              </Link>

              <Link to="/sources" className="button button--secondary-dark">
                Review the sources
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

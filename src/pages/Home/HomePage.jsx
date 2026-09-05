import { useState } from "react";
import { Link } from "react-router-dom";
import Footer from "../../components/Footer";
import Header from "../../components/Header";
import InvestigationCard from "../../components/InvestigationCard";
import SectionHeading from "../../components/SectionHeading";
import "./HomePage.css";
import skyline from "../../assets/MTN_skyrise.jpg";
import TennesseeCountyMapContainer from "../../components/jurisdiction-map/TennesseeCountyMapContainer";
import PrivacyTicker from "../../components/PrivacyTicker";
import NextMeetingBanner from "../../components/NextMeetingBanner";
import { useSavedCountyHref } from "../../utils/useSavedCountyHref";

// Independent, third-party projects — never fetched/embedded, only linked
// out to in a new tab. No logos are downloaded or bundled for these. Each
// card supports one or more links (Tennessee Sites has three independent
// local organizations rather than a single destination).
const externalResources = [
  {
    title: "DeFlock",
    description:
      "Explore a crowdsourced national map of automated license plate readers and report cameras found in your community.",
    links: [{ label: "Open DeFlock Map", url: "https://maps.deflock.org/" }],
  },
  {
    title: "Atlas of Surveillance",
    description:
      "Research which surveillance technologies law-enforcement agencies use across the United States and examine the sources behind each entry.",
    links: [{ label: "Explore the Atlas", url: "https://www.atlasofsurveillance.org/" }],
  },
  {
    title: "MuckRock",
    description:
      "File and track public-records requests, review previously released records, and learn from requests submitted in other jurisdictions.",
    links: [{ label: "Visit MuckRock", url: "https://www.muckrock.com/" }],
  },
  {
    title: "Tennessee Sites",
    description:
      "Connect with local Tennessee organizations documenting surveillance and organizing for community safety in their own cities.",
    links: [
      { label: "Crossville Privacy", url: "https://crossvilleprivacy.org/" },
      { label: "Maryville Privacy", url: "https://www.maryvilleprivacy.org/" },
      { label: "Nashville Community Safety", url: "https://nashvillecommunitysafety.net/" },
    ],
  },
];

export default function HomePage() {
  const [contactFormOpen, setContactFormOpen] = useState(false);

  // Both destinations respect the visitor's remembered county exactly like
  // Header.jsx's own "Status" link does — a saved county skips straight to
  // that county's page (or its Records Request Roadmap); anyone without one
  // yet lands on the general county chooser first, never a guessed page.
  const savedCountyStatusHref = useSavedCountyHref("/status", (slug) => `/status/${slug}`);
  const savedCountyGoalsHref = useSavedCountyHref("/status", (slug) => `/status/${slug}/records-request-goals`);

  const investigations = [
    {
      number: "01",
      title: "Examine the Technology",
      description:
        "Learn how surveillance tools, supporting infrastructure, vendors, contracts, and data-sharing systems operate in Tennessee.",
      buttonLabel: "Explore the Technology",
      to: "/education",
    },
    {
      number: "02",
      title: "Get Involved Locally",
      description:
        "Find your county chapter, attend upcoming meetings, receive local updates, and connect with people organizing in your community.",
      buttonLabel: "Find Your County",
      to: savedCountyStatusHref,
    },
    {
      number: "03",
      title: "Show Up and Speak Out",
      description:
        "Support local action by attending demonstrations, speaking during public comment, and showing officials that their decisions are being watched.",
      buttonLabel: "View Upcoming Meetings",
      // No dedicated meetings route exists yet — the county Status page is
      // where meeting banners actually render, so this intentionally
      // resolves to the same destination as "Find Your County" above.
      to: savedCountyStatusHref,
    },
    {
      number: "04",
      title: "Help Investigate",
      description:
        "Use public-records goals, prepared request forms, and archived evidence to help document surveillance systems across Tennessee.",
      buttonLabel: "Explore Investigations",
      to: savedCountyGoalsHref,
    },
  ];

  return (
    <div className="site-shell">
      <Header />
      <PrivacyTicker />

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
            <NextMeetingBanner countyId={null} />

            <SectionHeading
              eyebrow="What Are We Fighting?"
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
          <div className="container">
            <SectionHeading
              eyebrow="Related Resources"
              title="Map it. Research it. Challenge it."
              description="FLOCKBLOCK focuses on surveillance across Tennessee. These independent projects provide national mapping, public-records tools, research, and policy resources that can strengthen local investigations."
            />

            <div className="resource-grid">
              {externalResources.map((resource) => (
                <article className="resource-card" key={resource.title}>
                  <h3>{resource.title}</h3>
                  <p>{resource.description}</p>
                  <div className="resource-card__links">
                    {resource.links.map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        className="button button--secondary-dark resource-card__button"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label}
                        <span className="resource-card__button-icon" aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <p className="resource-grid__note">
              External sites are maintained by their respective organizations. FLOCKBLOCK does not control their content.
            </p>
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
              Explore options
            </Link>
          </div>
        </section>

        <section className="section">
          <div className="container participation">
            <SectionHeading
              eyebrow="Participate"
              title="Support the Cause!"
              description={
                <>
                  Join the local chapter emailer to know when to show up to meetings,
                  either in person or online, and when to make public comments at your
                  local city hall. Collect information for{" "}
                  <a href="https://deflock.org/">DeFlock.org</a>, spread the word about
                  FlockBlock TN, and educate others on the dangers of mass surveillance.
                  Prepare for the consequences of mass surveillance by building the{" "}
                  <a href="https://reticulum.network/">Reticulum network</a>.
                </>
              }
              align="center"
            />

            <div className="participation__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => setContactFormOpen(true)}
              >
                Join the emailer
              </button>

              <Link to="/education" className="button button--light">
                Learn about how it works
              </Link>

              <a
                href="https://www.facebook.com/groups/1458622071862905"
                className="button button--facebook"
                target="_blank"
                rel="noreferrer"
              >
                Join our Facebook
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

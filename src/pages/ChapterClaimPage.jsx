import { useSearchParams } from "react-router-dom";
import Footer from "../components/Footer";
import Header from "../components/Header";
import "./ChapterClaimPage.css";

function getCountyName(slug) {
  const name = slug
    .replace(/-county$/i, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return name ? `${name} County` : "your county";
}

export default function ChapterClaimPage() {
  const [searchParams] = useSearchParams();
  const countyName = getCountyName(searchParams.get("county") ?? "");

  return (
    <div className="site-shell">
      <Header />
      <main className="chapter-claim-page">
        <section>
          <p className="chapter-claim-eyebrow">Local chapter coordination</p>
          <h1>Volunteer to manage the {countyName} chapter</h1>
          <p>
            Chapter coordinators help neighbors stay informed and organize lawful,
            evidence-based local advocacy. This page is informational and does not
            automatically create an application, portal account, or chapter assignment.
          </p>

          <h2>Coordinator responsibilities</h2>
          <ul>
            <li>Organize meeting dates and communicate public meeting information.</li>
            <li>Help document local surveillance policies, contracts, and public records.</li>
            <li>Coordinate respectful outreach to residents and public officials.</li>
            <li>Protect volunteer and subscriber information from public disclosure.</li>
          </ul>

          <div className="chapter-claim-contact">
            <strong>Interested in volunteering?</strong>
            <span>Contact the organization through our centralized address:</span>
            <a href="mailto:admin@flockblocktn.org">admin@flockblocktn.org</a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

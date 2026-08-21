import Header from "../components/Header";
import Footer from "../components/Footer";
import "./AccessRevokedPage.css";

export default function AccessRevokedPage() {
  return (
    <div className="site-shell">
      <Header />
      <main className="access-revoked-page">
        <div className="access-revoked-page__inner">
          <h1>Access revoked</h1>
          <p>
            Access revoked. Contact{" "}
            <a href="mailto:admin@flockblockTN.org">admin@flockblockTN.org</a>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <strong>Flock Block Middle Tennessee</strong>
          <p>
            Publicly sourced research concerning surveillance technology,
            procurement, governance, and community oversight.
          </p>
        </div>

        <div className="site-footer__links">
          <Link to="/education">Education</Link>
          <Link to="/status">Jurisdiction Status</Link>
          <Link to="/archive">Public Records Archive</Link>
        </div>
      </div>
    </footer>
  );
}
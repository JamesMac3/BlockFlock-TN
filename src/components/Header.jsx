import { NavLink, useNavigate } from "react-router-dom";
import { usePortalAuth } from "../auth/portalAuth";
import logo from "../assets/logo.png";

const navigation = [
  { label: "Home", path: "/" },
  { label: "Education", path: "/education" },
  { label: "Status", path: "/status" },
];

export default function Header() {
  const navigate = useNavigate();
  const { account, authenticated, signOut } = usePortalAuth();
  const portalPath =
    account?.role === "admin" ? "/portal/admin" : "/portal/chapter";
  const portalLabel =
    account?.role === "admin" ? "Admin Dashboard" : "Chapter Portal";

  async function handleSignOut() {
    await signOut();
    navigate("/portal/login");
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <NavLink to="/" className="brand" aria-label="Flock Block home">
          <img src={logo} alt="Flock Block Middle Tennessee" />
        </NavLink>

        <nav className="site-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive
                  ? "site-nav__link site-nav__link--active"
                  : "site-nav__link"
              }
            >
              {item.label}
            </NavLink>
          ))}

          {authenticated ? (
            <>
              <NavLink
                to={portalPath}
                className={({ isActive }) =>
                  isActive
                    ? "site-nav__link site-nav__link--active"
                    : "site-nav__link"
                }
              >
                {portalLabel}
              </NavLink>
              <button
                type="button"
                className="site-nav__logout"
                onClick={handleSignOut}
              >
                Sign Out
              </button>
            </>
          ) : (
            <NavLink to="/portal/login" className="site-nav__login">
              Chapter Login
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { usePortalAuth } from "../auth/portalAuth";
import { supabase } from "../lib/supabase";
import { getStoredCountySlug } from "../utils/countyPreference";
import logo from "../assets/logo.png";
import logoLong from "../assets/logolong.png";

const navigation = [
  { label: "Home", path: "/" },
  { label: "Education", path: "/education" },
  { label: "Status", path: "/status" },
  { label: "Archive", path: "/archive" },
];

export default function Header() {
  const navigate = useNavigate();
  const headerRef = useRef(null);
  const { account, authenticated, signOut } = usePortalAuth();
  const portalPath =
    account?.role === "admin" ? "/portal/admin" : "/portal/chapter";
  const portalLabel =
    account?.role === "admin" ? "Admin Dashboard" : "Chapter Portal";

  // Defaults to the statewide chooser page (/status) exactly like before —
  // only upgraded to the remembered county's own page once that county is
  // confirmed to still exist. The stored slug is never trusted on its own.
  const [statusHref, setStatusHref] = useState("/status");

  useEffect(() => {
    let active = true;
    const storedSlug = getStoredCountySlug();
    if (!storedSlug) return undefined;

    supabase
      .from("counties")
      .select("slug")
      .eq("slug", storedSlug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        setStatusHref(`/status/${data.slug}`);
      });

    return () => {
      active = false;
    };
  }, []);

  // The sticky header's real height varies across breakpoints (nav wraps
  // onto its own line, the logo swaps, padding shrinks) — this is measured
  // live rather than guessed, and shared via a CSS custom property so any
  // element that must sit below the header (e.g. AdminPopout) can position
  // itself against the real value instead of a hardcoded magic number.
  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === "undefined") return;

    function updateHeaderHeight() {
      document.documentElement.style.setProperty("--site-header-height", `${header.offsetHeight}px`);
    }

    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate("/portal/login");
  }

  return (
    <header className="site-header" ref={headerRef}>
      <div className="site-header__inner">
        <NavLink to="/" className="brand" aria-label="Flock Block home">
          <picture>
            <source media="(max-width: 600px)" srcSet={logoLong} />
            <img src={logo} alt="Flock Block Middle Tennessee" />
          </picture>
        </NavLink>

        <nav className="site-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path === "/status" ? statusHref : item.path}
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
              Login
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

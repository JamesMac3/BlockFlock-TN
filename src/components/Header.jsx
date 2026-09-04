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

const MOBILE_BREAKPOINT_QUERY = "(min-width: 981px)";

export default function Header() {
  const navigate = useNavigate();
  const headerRef = useRef(null);
  const navRef = useRef(null);
  const toggleRef = useRef(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  // Escape and outside-click both close the panel while it's open; neither
  // listener is attached otherwise, so this never runs (or locks scroll,
  // or interferes with any other overlay) while the menu is closed.
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      toggleRef.current?.focus();
    }

    function handlePointerDown(event) {
      if (navRef.current?.contains(event.target) || toggleRef.current?.contains(event.target)) return;
      setMobileMenuOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [mobileMenuOpen]);

  // A panel left open while the viewport crosses back to desktop width
  // would otherwise sit open-but-hidden (desktop CSS ignores the open
  // class) until the next mobile-width toggle — close it the moment the
  // breakpoint changes instead.
  useEffect(() => {
    const query = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    function handleChange(event) {
      if (event.matches) setMobileMenuOpen(false);
    }
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  async function handleSignOut() {
    closeMobileMenu();
    await signOut();
    navigate("/portal/login");
  }

  return (
    <header className="site-header" ref={headerRef}>
      <div className="site-header__inner">
        <NavLink to="/" className="brand" aria-label="Flock Block home">
          <picture>
            {/* Aligned with the hamburger-menu breakpoint (980px, see
                HomePage.css) rather than the old 600px logo-swap point, so
                the compact logo variant is used for the whole single-row
                mobile header, not just its narrowest slice. */}
            <source media="(max-width: 980px)" srcSet={logoLong} />
            <img src={logo} alt="Flock Block Middle Tennessee" />
          </picture>
        </NavLink>

        <button
          type="button"
          ref={toggleRef}
          className="site-header__toggle"
          aria-expanded={mobileMenuOpen}
          aria-controls="site-nav"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileMenuOpen((current) => !current)}
        >
          <span className="site-header__toggle-bar" />
          <span className="site-header__toggle-bar" />
          <span className="site-header__toggle-bar" />
        </button>

        {/* Same nav element, same data, at both breakpoints — desktop CSS
            lays it out as a horizontal row and mobile CSS turns it into a
            dropdown panel gated by .site-nav--open; there is no second copy
            of these links or of the auth/route logic that builds them. */}
        <nav
          id="site-nav"
          ref={navRef}
          className={`site-nav ${mobileMenuOpen ? "site-nav--open" : ""}`}
          aria-label="Primary navigation"
        >
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path === "/status" ? statusHref : item.path}
              className={({ isActive }) =>
                isActive
                  ? "site-nav__link site-nav__link--active"
                  : "site-nav__link"
              }
              onClick={closeMobileMenu}
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
                onClick={closeMobileMenu}
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
            <NavLink to="/portal/login" className="site-nav__login" onClick={closeMobileMenu}>
              Login
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

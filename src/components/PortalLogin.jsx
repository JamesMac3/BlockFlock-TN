import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { usePortalAuth } from "../auth/portalAuth";
import { supabase } from "../lib/supabase";
import Header from "./Header";
import "./PortalLogin.css";

const ADMIN_EMAIL = "admin@flockblocktn.org";
const GENERIC_LOGIN_ERROR =
  "The selected account and password could not be verified.";

export default function PortalLogin() {
  const navigate = useNavigate();
  const { account, acceptSession, loading: sessionLoading, signOut } =
    usePortalAuth();
  const [loginMode, setLoginMode] = useState("chapter");
  const [counties, setCounties] = useState([]);
  const [selectedCountyId, setSelectedCountyId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingCounties, setLoadingCounties] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedCounty = useMemo(
    () => counties.find((county) => String(county.id) === selectedCountyId),
    [counties, selectedCountyId]
  );

  useEffect(() => {
    let active = true;

    async function loadCounties() {
      const { data, error } = await supabase
        .from("counties")
        .select("id, name, slug")
        .order("name");

      if (!active) return;

      if (error) {
        setErrorMessage("The county list is temporarily unavailable.");
      } else {
        setCounties(data ?? []);
      }

      setLoadingCounties(false);
    }

    loadCounties();
    return () => {
      active = false;
    };
  }, []);

  function changeMode(mode) {
    setLoginMode(mode);
    setPassword("");
    setShowPassword(false);
    setErrorMessage("");
  }

  async function failLogin() {
    await signOut();
    setPassword("");
    setSigningIn(false);
    setErrorMessage(GENERIC_LOGIN_ERROR);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

    const normalizedSlug = selectedCounty?.slug
      ?.replace(/-county$/i, "")
      .toLowerCase();
    const email =
      loginMode === "chapter"
        ? normalizedSlug
          ? `${normalizedSlug}@flockblocktn.org`
          : ""
        : ADMIN_EMAIL;

    if (!email || !password) {
      setPassword("");
      setErrorMessage(GENERIC_LOGIN_ERROR);
      return;
    }

    setSigningIn(true);

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user || !authData.session) {
      await failLogin();
      return;
    }

    const profile = await acceptSession(authData.session);

    if (!profile) {
      setPassword("");
      setSigningIn(false);
      setErrorMessage(GENERIC_LOGIN_ERROR);
      return;
    }

    const portalAccount = profile.account;
    const validChapter =
      loginMode === "chapter" &&
      portalAccount.role === "chapter_master" &&
      String(portalAccount.county_id) === selectedCountyId;
    const validAdmin =
      loginMode === "admin" && portalAccount.role === "admin";

    if (!validChapter && !validAdmin) {
      await failLogin();
      return;
    }

    navigate(validAdmin ? "/portal/admin" : "/portal/chapter", {
      replace: true,
    });
  }

  if (sessionLoading) {
    return <p className="portal-route-status">Restoring secure session...</p>;
  }

  if (account) {
    return (
      <Navigate
        to={account.role === "admin" ? "/portal/admin" : "/portal/chapter"}
        replace
      />
    );
  }

  return (
    <div className="site-shell">
      <Header />
      <main className="portal-login-page">
        <section
          className="portal-login-card"
          aria-labelledby="portal-login-title"
        >
          <p className="portal-login-eyebrow">Secure portal</p>
          <h1 id="portal-login-title">Portal login</h1>
          <p className="portal-login-intro">
            Select your access type and enter the credentials assigned to you.
          </p>

          <div className="portal-login-modes" aria-label="Login type">
            <button
              type="button"
              className={loginMode === "chapter" ? "is-active" : ""}
              onClick={() => changeMode("chapter")}
              aria-pressed={loginMode === "chapter"}
            >
              Chapter Login
            </button>
            <button
              type="button"
              className={loginMode === "admin" ? "is-active" : ""}
              onClick={() => changeMode("admin")}
              aria-pressed={loginMode === "admin"}
            >
              Admin Login
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {loginMode === "chapter" && (
              <label>
                County
                <select
                  value={selectedCountyId}
                  onChange={(event) => setSelectedCountyId(event.target.value)}
                  disabled={loadingCounties || signingIn}
                  autoFocus
                  required
                >
                  <option value="">
                    {loadingCounties
                      ? "Loading counties..."
                      : "Select your county"}
                  </option>
                  {counties.map((county) => (
                    <option key={county.id} value={county.id}>
                      {county.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Password
              <span className="portal-password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus={loginMode === "admin"}
                  disabled={signingIn}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={signingIn}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>

            {errorMessage && (
              <p className="portal-login-error" role="alert">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              className="portal-login-submit"
              disabled={
                signingIn || (loginMode === "chapter" && loadingCounties)
              }
            >
              {signingIn ? "Signing in..." : "Sign In"}
            </button>

            {loginMode === "chapter" && (
              <a
                className="portal-admin-contact"
                href="mailto:admin@flockblocktn.org"
              >
                Contact an administrator
              </a>
            )}
          </form>
        </section>
      </main>
    </div>
  );
}

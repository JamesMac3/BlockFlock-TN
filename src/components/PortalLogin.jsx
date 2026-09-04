import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { usePortalAuth } from "../auth/portalAuth";
import { supabase } from "../lib/supabase";
import { normalizeLoginIdentity, MAX_LOGIN_FIELD_LENGTH } from "../features/portal-admin/loginIdentity";
import { resolvePostLoginDestination } from "../features/portal-admin/loginRouting";
import Header from "./Header";
import Turnstile from "./Turnstile";
import "./PortalLogin.css";

const GENERIC_LOGIN_ERROR =
  "The account and password could not be verified.";

export default function PortalLogin() {
  const navigate = useNavigate();
  const { account, acceptSession, loading: sessionLoading, signOut } =
    usePortalAuth();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState(null);
  const turnstileRef = useRef(null);

  function resetTurnstile() {
    turnstileRef.current?.reset();
    setTurnstileToken(null);
  }

  async function failLogin() {
    await signOut();
    setPassword("");
    setSigningIn(false);
    setErrorMessage(GENERIC_LOGIN_ERROR);
    resetTurnstile();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

    if (identity.length > MAX_LOGIN_FIELD_LENGTH || password.length > MAX_LOGIN_FIELD_LENGTH) {
      setPassword("");
      setErrorMessage(GENERIC_LOGIN_ERROR);
      return;
    }

    const normalized = normalizeLoginIdentity(identity);

    if (!normalized.ok || !password) {
      setPassword("");
      setErrorMessage(GENERIC_LOGIN_ERROR);
      return;
    }

    // Defensive re-check, not just the disabled button — pressing Enter
    // submits the form even while a button is disabled.
    if (!turnstileToken) {
      setErrorMessage(GENERIC_LOGIN_ERROR);
      return;
    }

    setSigningIn(true);

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: normalized.email,
        password,
        options: {
          captchaToken: turnstileToken,
        },
      });

    if (authError || !authData.user || !authData.session) {
      await failLogin();
      return;
    }

    const profile = await acceptSession(authData.session);
    const destination = resolvePostLoginDestination({ profile });

    if (destination === "access-revoked") {
      setPassword("");
      setSigningIn(false);
      navigate("/portal/access-revoked", { replace: true });
      return;
    }

    if (destination === "failed") {
      await failLogin();
      return;
    }

    setPassword("");
    navigate(destination === "admin" ? "/portal/admin" : "/portal/chapter", {
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
            Enter the username or email and password assigned to you.
          </p>

          <form onSubmit={handleSubmit}>
            <label>
              Username or email
              <input
                type="text"
                value={identity}
                onChange={(event) => setIdentity(event.target.value)}
                autoComplete="username"
                autoFocus
                disabled={signingIn}
                maxLength={MAX_LOGIN_FIELD_LENGTH}
                required
              />
            </label>

            <label>
              Password
              <span className="portal-password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={signingIn}
                  maxLength={MAX_LOGIN_FIELD_LENGTH}
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

            <Turnstile ref={turnstileRef} action="portal_login" onToken={setTurnstileToken} />

            {errorMessage && (
              <p className="portal-login-error" role="alert">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              className="portal-login-submit"
              disabled={signingIn || !turnstileToken}
            >
              {signingIn ? "Signing in..." : "Sign In"}
            </button>

            <a
              className="portal-admin-contact"
              href="mailto:admin@flockblocktn.org"
            >
              Contact an administrator
            </a>
          </form>
        </section>
      </main>
    </div>
  );
}

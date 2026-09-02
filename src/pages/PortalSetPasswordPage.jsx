import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import { supabase } from "../lib/supabase";
import "../components/PortalLogin.css";

const MAX_PASSWORD_LENGTH = 120;

export default function PortalSetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const verificationStarted = useRef(false);
  const [verificationState, setVerificationState] = useState("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (verificationStarted.current) return;
    verificationStarted.current = true;
    async function verifyLink() {
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      if (!tokenHash || (type !== "invite" && type !== "recovery")) {
        setVerificationState("invalid");
        return;
      }
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      setVerificationState(error ? "invalid" : "ready");
    }
    verifyLink();
  }, [searchParams]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
      setMessage("Choose a password between 8 and 120 characters.");
      return;
    }
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage("The password could not be saved. Request a new setup link from an administrator.");
      setBusy(false);
      return;
    }
    await supabase.auth.signOut();
    navigate("/portal/login", { replace: true });
  }

  return (
    <div className="site-shell">
      <Header />
      <main className="portal-login-page">
        <section className="portal-login-card" aria-labelledby="set-password-title">
          <p className="portal-login-eyebrow">Secure account setup</p>
          <h1 id="set-password-title">Choose your password</h1>

          {verificationState === "checking" && <p role="status">Checking your secure setup link...</p>}
          {verificationState === "invalid" && (
            <p className="portal-login-error" role="alert">
              This setup link is invalid or has expired. Ask an administrator to send a new one.
            </p>
          )}
          {verificationState === "ready" && (
            <form onSubmit={handleSubmit}>
              <label>
                New password
                <span className="portal-password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={MAX_PASSWORD_LENGTH}
                    disabled={busy}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={MAX_PASSWORD_LENGTH}
                  disabled={busy}
                  required
                />
              </label>
              {message && <p className="portal-login-error" role="alert">{message}</p>}
              <button type="submit" className="portal-login-submit" disabled={busy}>
                {busy ? "Saving..." : "Save password"}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

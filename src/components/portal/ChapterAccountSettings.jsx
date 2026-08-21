import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { describeAccountState, describePostApprovalBehavior } from "../../features/portal-admin/chapterAccounts";
import "./ChapterAccountSettings.css";

export default function ChapterAccountSettings({ user, account, onSignOut }) {
  const [forwardingEmail, setForwardingEmail] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadForwardingEmail() {
      const { data, error } = await supabase.rpc("rrg_get_my_forwarding_email");
      if (!active) return;
      if (!error) setForwardingEmail(data ?? "");
      setLoadingEmail(false);
    }
    loadForwardingEmail();
    return () => { active = false; };
  }, []);

  async function handleSaveForwardingEmail(event) {
    event.preventDefault();
    setSavingEmail(true);
    setEmailMessage("");
    setEmailError("");
    const { data, error } = await supabase.rpc("rrg_set_my_forwarding_email", { p_email: forwardingEmail });
    if (error) {
      setEmailError(error.message);
    } else {
      setForwardingEmail(data);
      setEmailMessage("Forwarding email updated.");
    }
    setSavingEmail(false);
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (newPassword.length < 8) {
      setPasswordError("The new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new password and confirmation do not match.");
      return;
    }

    setChangingPassword(true);
    try {
      // Reauthenticate with the current password before changing it, since
      // an existing session alone should not be sufficient to take over an
      // account's credentials.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthError) {
        setPasswordError("Current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setPasswordError(updateError.message);
        return;
      }

      setPasswordMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setChangingPassword(false);
    }
  }

  const { label: stateLabel } = describeAccountState(account ?? {});
  const approvalBehavior = describePostApprovalBehavior(account ?? {});

  return (
    <div className="chapter-account-settings">
      <h2>Account Settings</h2>

      <dl className="chapter-account-settings__summary">
        <div>
          <dt>Flock Block login email</dt>
          <dd>{user?.email}</dd>
        </div>
        <div>
          <dt>Account state</dt>
          <dd>{stateLabel}</dd>
        </div>
        <div>
          <dt>Post publishing</dt>
          <dd>{approvalBehavior}</dd>
        </div>
      </dl>

      <section className="chapter-account-settings__section">
        <h3>Forwarding destination email</h3>
        <p>Private. Never shown publicly. Used to forward incoming county contact requests.</p>
        {loadingEmail ? (
          <p role="status">Loading...</p>
        ) : (
          <form onSubmit={handleSaveForwardingEmail}>
            <label htmlFor="forwarding-email">Forwarding email</label>
            <input
              id="forwarding-email"
              type="email"
              value={forwardingEmail}
              onChange={(event) => setForwardingEmail(event.target.value)}
              required
            />
            {emailError && <p className="chapter-account-settings__error" role="alert">{emailError}</p>}
            {emailMessage && <p className="chapter-account-settings__success" role="status">{emailMessage}</p>}
            <button type="submit" disabled={savingEmail}>{savingEmail ? "Saving..." : "Save forwarding email"}</button>
          </form>
        )}
      </section>

      <section className="chapter-account-settings__section">
        <h3>Change password</h3>
        <form onSubmit={handleChangePassword}>
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          {passwordError && <p className="chapter-account-settings__error" role="alert">{passwordError}</p>}
          {passwordMessage && <p className="chapter-account-settings__success" role="status">{passwordMessage}</p>}
          <button type="submit" disabled={changingPassword}>{changingPassword ? "Updating..." : "Change password"}</button>
        </form>
      </section>

      <button type="button" className="chapter-account-settings__sign-out" onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PortalAuthContext } from "./portalAuth";

const ALLOWED_ROLES = new Set(["chapter_master", "admin"]);

export function PortalAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState(null);
  const [assignedCounty, setAssignedCounty] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearPortalState = useCallback(() => {
    setSession(null);
    setAccount(null);
    setAssignedCounty(null);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    clearPortalState();
    setLoading(false);
  }, [clearPortalState]);

  const loadPortalProfile = useCallback(
    async (user) => {
      const { data: portalAccount, error: accountError } = await supabase
        .from("portal_accounts")
        .select("user_id, role, county_id, status")
        .eq("user_id", user.id)
        .single();

      if (
        accountError ||
        !portalAccount ||
        portalAccount.status !== "active" ||
        !ALLOWED_ROLES.has(portalAccount.role)
      ) {
        await signOut();
        return null;
      }

      let county = null;

      if (portalAccount.role === "chapter_master") {
        if (portalAccount.county_id === null) {
          await signOut();
          return null;
        }

        const { data: countyData, error: countyError } = await supabase
          .from("counties")
          .select("id, name, slug, camera_count, drone_count")
          .eq("id", portalAccount.county_id)
          .single();

        if (countyError || !countyData) {
          await signOut();
          return null;
        }

        county = countyData;
      }

      setAccount(portalAccount);
      setAssignedCounty(county);
      return { account: portalAccount, assignedCounty: county };
    },
    [signOut]
  );

  const refreshPortalProfile = useCallback(
    async (userOverride) => {
      setLoading(true);

      let user = userOverride;

      if (!user) {
        const { data } = await supabase.auth.getUser();
        user = data.user;
      }

      if (!user) {
        clearPortalState();
        setLoading(false);
        return null;
      }

      const profile = await loadPortalProfile(user);
      setLoading(false);
      return profile;
    },
    [clearPortalState, loadPortalProfile]
  );

  const acceptSession = useCallback(
    async (nextSession) => {
      setSession(nextSession);
      return refreshPortalProfile(nextSession.user);
    },
    [refreshPortalProfile]
  );

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (!data.session) {
        clearPortalState();
        setLoading(false);
        return;
      }

      setSession(data.session);
      await refreshPortalProfile(data.session.user);
    }

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;

      if (event === "SIGNED_OUT" || !nextSession) {
        clearPortalState();
        setLoading(false);
        return;
      }

      setSession(nextSession);

      if (event === "USER_UPDATED") {
        setTimeout(() => refreshPortalProfile(nextSession.user), 0);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [clearPortalState, refreshPortalProfile]);

  const user = session?.user ?? null;
  const role = account?.role ?? null;
  const assignedCountyId = account?.county_id ?? null;
  const authenticated = Boolean(user && account && !loading);

  return (
    <PortalAuthContext.Provider
      value={{
        session,
        user,
        account,
        role,
        assignedCountyId,
        assignedCounty,
        loading,
        authenticated,
        acceptSession,
        refreshPortalProfile,
        signOut,
      }}
    >
      {children}
    </PortalAuthContext.Provider>
  );
}

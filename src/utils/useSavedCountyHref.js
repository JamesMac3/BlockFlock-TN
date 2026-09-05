import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getStoredCountySlug } from "./countyPreference";

/**
 * Resolves the visitor's remembered county (if any) against the live
 * counties table and returns a destination path built from that county's
 * slug — falling back to fallbackPath until (or unless) a valid stored
 * county is confirmed. Mirrors Header.jsx's own "Status" link resolution:
 * the stored slug is never trusted on its own, so an unauthenticated
 * visitor with no (or a stale) stored county always lands on the general
 * chooser first, never a synthesized county page.
 */
export function useSavedCountyHref(fallbackPath, buildCountyPath) {
  const [href, setHref] = useState(fallbackPath);

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
        setHref(buildCountyPath(data.slug));
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fallbackPath/buildCountyPath are constant per call site
  }, []);

  return href;
}

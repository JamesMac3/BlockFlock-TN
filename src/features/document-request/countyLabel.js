const COUNTY_SUFFIX_PATTERN = /\bcounty$/i;

/**
 * Appends " County" to a county name for display, unless the stored name
 * already ends in "County" (e.g. some counties.name values already include
 * the word). Never produces a doubled "County County" label.
 */
export function formatCountyLabel(name) {
  if (!name) return name;
  const trimmed = name.trim();
  return COUNTY_SUFFIX_PATTERN.test(trimmed) ? trimmed : `${trimmed} County`;
}

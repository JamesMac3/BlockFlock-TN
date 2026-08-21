// Pure county/city search matching, extracted from CountySelector so it can
// be exercised by a regression test without a component-render harness.
// county.cities is expected to be an array of plain city-name strings.
export function matchCounties(counties, search, { includeCities = true } = {}) {
  const normalizedSearch = (search ?? "").trim().toLowerCase().replace(/\s+/g, " ");

  return [...counties]
    .sort((first, second) => first.name.localeCompare(second.name))
    .flatMap((county) => {
      const normalizedName = county.name.toLowerCase().replace(/\s+/g, " ");
      const normalizedSlug = county.slug.toLowerCase().replace(/-/g, " ");
      const matchesCounty =
        !normalizedSearch ||
        normalizedName.includes(normalizedSearch) ||
        normalizedSlug.includes(normalizedSearch);
      const matches = matchesCounty
        ? [{ key: `county-${county.id}`, county, label: county.name, type: "County result" }]
        : [];

      if (includeCities && normalizedSearch) {
        (Array.isArray(county.cities) ? county.cities : [])
          .filter((city) => city.toLowerCase().replace(/\s+/g, " ").includes(normalizedSearch))
          .forEach((city) => {
            matches.push({
              key: `city-${county.id}-${city}`,
              county,
              label: city,
              type: county.name,
            });
          });
      }

      return matches;
    });
}

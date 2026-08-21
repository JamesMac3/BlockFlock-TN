import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { matchCounties } from "../utils/countySearch";
import "./CountySelector.css";

export default function CountySelector({
  counties,
  currentCountySlug,
  onSelect,
  autoFocus = false,
  includeCities = true,
  showStatusLinks = false,
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);
  const normalizedSearch = search.trim().toLowerCase().replace(/\s+/g, " ");

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const results = useMemo(
    () => matchCounties(counties, normalizedSearch, { includeCities }),
    [counties, includeCities, normalizedSearch]
  );

  return (
    <div className="county-selector">
      <label htmlFor="shared-county-search">Find your county or community</label>
      <input
        ref={inputRef}
        id="shared-county-search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Try Murfreesboro, Smyrna, or Rutherford"
        autoComplete="off"
      />
      {!normalizedSearch && includeCities && (
        <p>Search by county, city, or community, or choose a county below.</p>
      )}
      <div className="county-selector__results" aria-live="polite">
        {results.length ? results.map((result) => {
          const isCurrent = result.county.slug === currentCountySlug;
          return (
            <div className="county-selector__result" key={result.key}>
              <button
                type="button"
                className={isCurrent ? "is-current" : ""}
                onClick={() => onSelect(result.county)}
              >
                <strong>
                  {result.label}{isCurrent ? " — Current" : ""}
                </strong>
                <span>{result.type}</span>
              </button>
              {showStatusLinks && (
                <Link to={`/status/${result.county.slug}`}>View status</Link>
              )}
            </div>
          );
        }) : <p>No matching county or community found.</p>}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import CountySelector from "../CountySelector";
import { ACTIVE_CHAPTER_COUNTY_SLUGS } from "../../config/activeChapterCounties";
import "./TennesseeCountyMap.css";
function getCameraCount(county) {
  return county?.cameraCount ?? county?.camera_count ?? null;
}

function getDroneCount(county) {
  return county?.droneCount ?? county?.drone_count ?? null;
}

function getCountyColor(cameraCount) {
  if (cameraCount === null || cameraCount === undefined) return "var(--county-unknown)";
  if (cameraCount === 0) return "var(--county-zero)";
  if (cameraCount <= 5) return "var(--county-1-5)";
  if (cameraCount <= 15) return "var(--county-6-15)";
  if (cameraCount <= 30) return "var(--county-16-30)";
  if (cameraCount <= 60) return "var(--county-31-60)";
  if (cameraCount <= 125) return "var(--county-61-125)";
  if (cameraCount <= 250) return "var(--county-126-250)";
  return "var(--county-251-plus)";
}

function CountyHoverLabel({ mapRef }) {
  const [hoveredCountyName, setHoveredCountyName] = useState("");

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    function handlePointerOver(event) {
      const county = event.target.closest?.(".county");
      setHoveredCountyName(county?.id ? `${county.id} County` : "");
    }

    function clearHoveredCounty() {
      setHoveredCountyName("");
    }

    map.addEventListener("pointerover", handlePointerOver);
    map.addEventListener("pointerleave", clearHoveredCounty);

    return () => {
      map.removeEventListener("pointerover", handlePointerOver);
      map.removeEventListener("pointerleave", clearHoveredCounty);
    };
  }, [mapRef]);

  return (
    <div className="county-map-hover-label" aria-live="polite">
      {hoveredCountyName || "Mouse over a county and click to select"}
    </div>
  );
}

function formatCalendarDate(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function getMeeting(countyName, county) {
  const storedStart = county?.next_meeting_at
    ? new Date(county.next_meeting_at)
    : null;
  const start =
    storedStart && !Number.isNaN(storedStart.getTime())
      ? storedStart
      : new Date();

  if (!storedStart || Number.isNaN(storedStart.getTime())) {
    start.setHours(15, 0, 0, 0);

    const daysUntilSaturday = (6 - start.getDay() + 7) % 7;
    start.setDate(start.getDate() + daysUntilSaturday);

    if (start <= new Date()) {
      start.setDate(start.getDate() + 7);
    }
  }

  const end = new Date(start);
  end.setHours(16, 0, 0, 0);

  const location = county?.meeting_location || "Local Library";
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Flock Block Tennessee//Chapter Meeting//EN",
    "BEGIN:VEVENT",
    `UID:${countyName.toLowerCase().replace(/\s+/g, "-")}-${formatCalendarDate(start)}@flockblocktn.org`,
    `DTSTART:${formatCalendarDate(start)}`,
    `DTEND:${formatCalendarDate(end)}`,
    `SUMMARY:${countyName} County Chapter Meeting`,
    `LOCATION:${location}`,
    "DESCRIPTION:Placeholder date and location for the next local chapter meeting.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return {
    dateLabel: start.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    timeLabel: start.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
    location,
    calendarHref: `data:text/calendar;charset=utf-8,${encodeURIComponent(calendar)}`,
  };
}

export default function TennesseeCountyMap({
  countyData = {},
  initialCounty = null,
  selectedCounty: selectedCountyProp,
  onCountySelect,
  onJoinEmailUpdates,
}) {
  const [internalSelectedCounty, setInternalSelectedCounty] = useState(initialCounty);
  const mapRef = useRef(null);

  const selectedCounty = selectedCountyProp !== undefined
    ? selectedCountyProp
    : internalSelectedCounty;
  const activeCounty = selectedCounty;
  const activeCountyData = countyData[activeCounty] ?? {};
  const isStatewide = !activeCounty;
  const meeting = getMeeting(activeCounty || "Tennessee", activeCountyData);
  const countyEntries = Object.entries(countyData).sort(([, first], [, second]) =>
    first.name.localeCompare(second.name)
  );
  const counties = Object.values(countyData);
  const claimedCountyCount = counties.filter((county) =>
    ACTIVE_CHAPTER_COUNTY_SLUGS.has(county.slug)
  ).length;
  const statewideMetrics = {
    claimed: claimedCountyCount,
    unclaimed: Math.max(counties.length - claimedCountyCount, 0),
    cameras: counties.reduce(
      (sum, county) => sum + Number(county.camera_count ?? 0),
      0
    ),
    drones: counties.reduce(
      (sum, county) => sum + Number(county.drone_count ?? 0),
      0
    ),
  };
  function handleCountySelect(countyName) {
    setInternalSelectedCounty(countyName);
    onCountySelect?.(countyName);
  }

  // County hover is handled entirely by CSS so moving across the SVG does not
  // rerender every county path. Kept as a no-op for the existing SVG handlers.
  function setHoveredCounty() {}

  function handleMapKeyDown(event) {
    const countyKeys = countyEntries.map(([countyKey]) => countyKey);

    if (event.key === "Home" || event.key === "Escape") {
      event.preventDefault();
      handleCountySelect(null);
      return;
    }

    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const currentIndex = countyKeys.indexOf(selectedCounty);
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : countyKeys.length - 1
      : (currentIndex + direction + countyKeys.length) % countyKeys.length;

    handleCountySelect(countyKeys[nextIndex]);
  }

  const countyStatusPath = activeCountyData.slug
    ? `/status/${activeCountyData.slug}`
    : "/status";
  const countyClaimPath = `/chapters/claim?county=${encodeURIComponent(
    activeCountyData.slug || activeCounty?.toLowerCase() || ""
  )}`;
  const hasActiveChapter = ACTIVE_CHAPTER_COUNTY_SLUGS.has(activeCountyData.slug);

  return (
    <section className="tennessee-map-section" aria-label="Tennessee county surveillance map">
      <section className="mobile-county-finder" aria-label="Find your county or community">
        <button
          className="statewide-overview-button"
          type="button"
          onClick={() => handleCountySelect(null)}
        >
          Statewide overview
        </button>
        <CountySelector
          counties={countyEntries.map(([countyKey, county]) => ({ ...county, countyKey }))}
          currentCountySlug={selectedCounty ? countyData[selectedCounty]?.slug : null}
          onSelect={(county) => handleCountySelect(county.countyKey)}
          showStatusLinks
        />
      </section>

      <div className="tennessee-map-panel">
        <CountyHoverLabel mapRef={mapRef} />
        <svg
          ref={mapRef}
          className="tennessee-map"
          viewBox="0 0 91 34"
          role="img"
          aria-label="Interactive map of Tennessee counties"
          preserveAspectRatio="xMidYMid meet"
        >
          <g
            className="county-map-counties"
            tabIndex="0"
            role="group"
            aria-label="County selection. Use arrow keys to select a county; press Home or Escape for the statewide overview."
            onKeyDown={handleMapKeyDown}
            onMouseLeave={() => setHoveredCounty(null)}
          >
            <path
              id="Sullivan"
              className={`county ${selectedCounty === "Sullivan" ? "county--selected" : ""}`}
              d="m 87.262059,2.2064028 -1.393,1.601 -3.011,1.906 -0.473,0.062 -0.162,-0.048 -0.51,-0.371 -0.355,-0.072 -0.614,0.194 -1.266,0.249 -0.568,0.089 0.433,-2.19 3.205,-0.478 0.513,-0.077 0.992,-0.135 2.158,-0.311 0.072,-0.302 0.979,-0.117"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Sullivan"])) }}
              onMouseEnter={() => setHoveredCounty("Sullivan")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Sullivan")}
            >
              <title>Sullivan County</title>
            </path>
            <path
              id="Johnson"
              className={`county ${selectedCounty === "Johnson" ? "county--selected" : ""}`}
              d="m 87.262059,2.2064028 1.834,-0.248 -0.266,0.353 -0.049,2.644 0.039,0.614 -0.215,0.072 -0.019,0 -0.161,0.008 -0.27,-0.086 -0.064,-0.148 -0.054,0.031 -0.013,0.01 -0.514,0.352 -0.474,0.531 -0.076,0.207 -0.108,0.311 -0.181,0.069 -0.343,-0.293 -0.703,-0.732 -0.157,-0.31 0.798,-1.348 0,-0.04 -0.397,-0.396 1.393,-1.601"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Johnson"])) }}
              onMouseEnter={() => setHoveredCounty("Johnson")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Johnson")}
            >
              <title>Johnson County</title>
            </path>
            <path
              id="McNairy"
              className={`county ${selectedCounty === "McNairy" ? "county--selected" : ""}`}
              d="m 21.823059,25.859401 0.216,5.003 -4.249,0.338 -0.199,-3.271 0.784,-0.388 0.117,-0.496 0.19,-0.343 0.266,-0.347 0.505,-0.252 0.193,-0.082 0.577,-0.09 1.6,-0.072"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["McNairy"])) }}
              onMouseEnter={() => setHoveredCounty("McNairy")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("McNairy")}
            >
              <title>McNairy County</title>
            </path>
            <path
              id="Chester"
              className={`county ${selectedCounty === "Chester" ? "county--selected" : ""}`}
              d="m 19.002059,23.385401 2.803,1.982 0.018,0.492 -1.6,0.072 -0.577,0.09 -0.193,0.082 -0.505,0.252 -0.266,0.347 -0.19,0.343 -0.117,0.496 -0.784,0.388 -0.217,-0.965 -0.546,-0.758 -0.039,-0.562 2.213,-2.259"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Chester"])) }}
              onMouseEnter={() => setHoveredCounty("Chester")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Chester")}
            >
              <title>Chester County</title>
            </path>
            <path
              id="Hardeman"
              className={`county ${selectedCounty === "Hardeman" ? "county--selected" : ""}`}
              d="m 14.315059,25.783401 2.474,-0.139 0.039,0.562 0.546,0.758 0.217,0.965 0.199,3.271 -0.383,0.032 -2.034,0.158 -1.892,0.139 -0.225,-5.223 1.059,-0.523"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Hardeman"])) }}
              onMouseEnter={() => setHoveredCounty("Hardeman")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Hardeman")}
            >
              <title>Hardeman County</title>
            </path>
            <path
              id="Fayette"
              className={`county ${selectedCounty === "Fayette" ? "county--selected" : ""}`}
              d="m 10.227059,26.440401 3.029,-0.134 0.225,5.223 -1.618,0.114 -3.0560001,0.198 -0.063,-1.736 -0.104,-1.685 -0.045,-1.515 1.6320001,-0.465"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Fayette"])) }}
              onMouseEnter={() => setHoveredCounty("Fayette")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Fayette")}
            >
              <title>Fayette County</title>
            </path>
            <path
              id="Haywood"
              className={`county ${selectedCounty === "Haywood" ? "county--selected" : ""}`}
              d="m 11.078059,20.987401 0.004,0.045 0.149,0.19 0.113,0.117 0.259,0.188 0.444,0.208 0.217,0.005 1.113,0.348 0.789,0.301 0.149,3.394 -1.059,0.523 -3.029,0.134 -0.4550001,-2.279 0.081,-0.037 0.2430001,-0.176 0.311,-1.906 -0.004,-0.095 -0.131,0 -0.009,-0.176 0.058,-0.225 0.28,-0.595 0.477,0.036"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Haywood"])) }}
              onMouseEnter={() => setHoveredCounty("Haywood")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Haywood")}
            >
              <title>Haywood County</title>
            </path>
            <path
              id="Madison"
              className={`county ${selectedCounty === "Madison" ? "county--selected" : ""}`}
              d="m 18.871059,20.775401 0.131,2.61 -2.213,2.259 -2.474,0.139 -0.149,-3.394 1.493,-1.469 2.17,-0.086 1.042,-0.059"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Madison"])) }}
              onMouseEnter={() => setHoveredCounty("Madison")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Madison")}
            >
              <title>Madison County</title>
            </path>
            <path
              id="Crockett"
              className={`county ${selectedCounty === "Crockett" ? "county--selected" : ""}`}
              d="m 12.642059,18.504401 0.578,0.37 0.107,0.697 0.104,0.258 0.2,0.397 1.346,0.31 0.682,0.384 -1.493,1.469 -0.789,-0.301 -1.113,-0.348 -0.217,-0.005 -0.444,-0.208 -0.259,-0.188 -0.113,-0.117 -0.149,-0.19 -0.004,-0.045 0.081,-0.834 1.483,-1.649"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Crockett"])) }}
              onMouseEnter={() => setHoveredCounty("Crockett")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Crockett")}
            >
              <title>Crockett County</title>
            </path>
            <path
              id="Gibson"
              className={`county ${selectedCounty === "Gibson" ? "county--selected" : ""}`}
              d="m 12.805059,15.822401 1.992,-0.383 0.302,0.346 0.77,0.681 0.077,0.037 0.081,-0.019 0.924,0.271 0.757,0.55 0.121,3.529 -2.17,0.086 -0.682,-0.384 -1.346,-0.31 -0.2,-0.397 -0.104,-0.258 -0.107,-0.697 -0.578,-0.37 0.163,-2.682"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Gibson"])) }}
              onMouseEnter={() => setHoveredCounty("Gibson")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Gibson")}
            >
              <title>Gibson County</title>
            </path>
            <path
              id="Carroll"
              className={`county ${selectedCounty === "Carroll" ? "county--selected" : ""}`}
              d="m 19.294059,16.038401 3.31,0.127 0.647,3.523 0.019,0.379 -4.051,0.221 -0.154,0.145 -0.135,0.175 -0.059,0.167 -1.042,0.059 -0.121,-3.529 1.586,-1.267"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Carroll"])) }}
              onMouseEnter={() => setHoveredCounty("Carroll")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Carroll")}
            >
              <title>Carroll County</title>
            </path>
            <path
              id="Weakley"
              className={`county ${selectedCounty === "Weakley" ? "county--selected" : ""}`}
              d="m 16.000059,11.703402 3.079,-0.222 0.215,4.556999 -1.586,1.267 -0.757,-0.55 -0.924,-0.271 -0.081,0.019 -0.077,-0.037 -0.77,-0.681 -0.302,-0.346 -0.082,-2.42 0.033,-0.041 0.193,0.009 0.148,0.036 0.145,0.14 0.157,0.018 0.699,-0.284 -0.036,-0.775 -0.166,-0.409999 0.112,-0.009"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Weakley"])) }}
              onMouseEnter={() => setHoveredCounty("Weakley")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Weakley")}
            >
              <title>Weakley County</title>
            </path>
            <path
              id="Obion"
              className={`county ${selectedCounty === "Obion" ? "county--selected" : ""}`}
              d="m 15.811059,11.716402 0.077,-0.004 0.166,0.409999 0.036,0.775 -0.699,0.284 -0.157,-0.018 -0.145,-0.14 -0.148,-0.036 -0.193,-0.009 -0.033,0.041 0.082,2.42 -1.992,0.383 -3.3890001,0.135 1.1440001,-3.862 5.251,-0.378999"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Obion"])) }}
              onMouseEnter={() => setHoveredCounty("Obion")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Obion")}
            >
              <title>Obion County</title>
            </path>
            <path
              id="Lake"
              className={`county ${selectedCounty === "Lake" ? "county--selected" : ""}`}
              d="m 10.560059,12.095401 -1.1440001,3.862 -1.489,0.455 0.736,-2.019 -0.082,-2.096 0.555,-0.03 0.698,-0.069 0.7260001,-0.103"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Lake"])) }}
              onMouseEnter={() => setHoveredCounty("Lake")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Lake")}
            >
              <title>Lake County</title>
            </path>
            <path
              id="Dyer"
              className={`county ${selectedCounty === "Dyer" ? "county--selected" : ""}`}
              d="m 9.4160589,15.957401 3.3890001,-0.135 -0.163,2.682 -1.483,1.649 -0.129,-0.229 -0.086,-0.109 -0.514,-0.464 -0.8650001,0.044 -1.489,0.57 -0.508,0.13 -0.551,-1.217 0.91,-2.466 1.489,-0.455"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Dyer"])) }}
              onMouseEnter={() => setHoveredCounty("Dyer")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Dyer")}
            >
              <title>Dyer County</title>
            </path>
            <path
              id="Lauderdale"
              className={`county ${selectedCounty === "Lauderdale" ? "county--selected" : ""}`}
              d="m 7.5680589,20.095401 0.508,-0.13 1.489,-0.57 0.8650001,-0.044 0.514,0.464 0.086,0.109 0.129,0.229 -0.081,0.834 -0.477,-0.036 -0.28,0.595 -0.058,0.225 0.009,0.176 0.131,0 0.004,0.095 -0.311,1.906 -0.2430001,0.176 -0.081,0.037 -0.456,-0.325 -0.834,-0.446 -1.432,0.144 -0.311,0.112 -0.244,0.181 -0.536,0.495 -0.199,0.239 -0.185,0.433 0.285,-2.731 0.91,-1.943 0.066,-0.058 0.034,-0.023 0.225,-0.117 0.188,-0.032 0.285,0.005"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Lauderdale"])) }}
              onMouseEnter={() => setHoveredCounty("Lauderdale")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Lauderdale")}
            >
              <title>Lauderdale County</title>
            </path>
            <path
              id="Tipton"
              className={`county ${selectedCounty === "Tipton" ? "county--selected" : ""}`}
              d="m 9.7720589,24.161401 0.4550001,2.279 -1.6320001,0.465 -0.203,-0.144 -0.55,-0.23 -0.071,-0.01 -3.452,0.393 -0.492,0.238 -0.699,-0.688 2.447,-1.47 0.185,-0.433 0.199,-0.239 0.536,-0.495 0.244,-0.181 0.311,-0.112 1.432,-0.144 0.834,0.446 0.456,0.325"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Tipton"])) }}
              onMouseEnter={() => setHoveredCounty("Tipton")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Tipton")}
            >
              <title>Tipton County</title>
            </path>
            <path
              id="Shelby"
              className={`county ${selectedCounty === "Shelby" ? "county--selected" : ""}`}
              d="m 3.8270589,27.152401 0.492,-0.238 3.452,-0.393 0.071,0.01 0.55,0.23 0.203,0.144 0.045,1.515 0.104,1.685 0.063,1.736 -0.838,0.062 -6.13,0.375 -0.018,-0.18 0.126,-0.402 1.05,-0.346 1.105,-0.849 0.157,-0.193 0.019,-0.029 0.004,-0.008 0,-0.012 0.004,-0.014 -0.419,-2.957 -0.04,-0.136"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Shelby"])) }}
              onMouseEnter={() => setHoveredCounty("Shelby")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Shelby")}
            >
              <title>Shelby County</title>
            </path>
            <path
              id="Henderson"
              className={`county ${selectedCounty === "Henderson" ? "county--selected" : ""}`}
              d="m 23.270059,20.067401 0.104,2.697 -0.461,1.085 0.06,1.366 0.067,-0.006 -1.235,0.158 -2.803,-1.982 -0.131,-2.61 0.059,-0.167 0.135,-0.175 0.154,-0.145 4.051,-0.221"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Henderson"])) }}
              onMouseEnter={() => setHoveredCounty("Henderson")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Henderson")}
            >
              <title>Henderson County</title>
            </path>
            <path
              id="Henry"
              className={`county ${selectedCounty === "Henry" ? "county--selected" : ""}`}
              d="m 19.358059,11.463402 4.475,-0.311 0.799,1.707999 -1.064,0.095 -0.014,0.018 -0.041,0.428 0.023,0.203 0.226,0.726 -0.808,1.398 -0.35,0.437 -3.31,-0.127 -0.215,-4.556999 0.279,-0.018"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Henry"])) }}
              onMouseEnter={() => setHoveredCounty("Henry")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Henry")}
            >
              <title>Henry County</title>
            </path>
            <path
              id="Benton"
              className={`county ${selectedCounty === "Benton" ? "county--selected" : ""}`}
              d="m 24.632059,12.860401 0.099,0.086 0.446,1.402 0.432,1.005 0.158,3.024 0,0.248 -0.068,0.545 -0.048,0.145 -0.168,0.252 -0.055,0.334 -2.177,-0.213 -0.647,-3.523 0.35,-0.437 0.808,-1.398 -0.226,-0.726 -0.023,-0.203 0.041,-0.428 0.014,-0.018 1.064,-0.095"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Benton"])) }}
              onMouseEnter={() => setHoveredCounty("Benton")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Benton")}
            >
              <title>Benton County</title>
            </path>
            <path
              id="Decatur"
              className={`county ${selectedCounty === "Decatur" ? "county--selected" : ""}`}
              d="m 23.251059,19.688401 2.177,0.213 -0.332,0.951 -0.168,0.585 0.145,3.282 0.099,0.176 0.077,0.089 0.072,0.036 0.153,-0.012 -0.145,0.419 -2.289,-0.218 -0.067,0.006 -0.06,-1.366 0.461,-1.085 -0.104,-2.697 -0.019,-0.379"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Decatur"])) }}
              onMouseEnter={() => setHoveredCounty("Decatur")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Decatur")}
            >
              <title>Decatur County</title>
            </path>
            <path
              id="Hardin"
              className={`county ${selectedCounty === "Hardin" ? "county--selected" : ""}`}
              d="m 21.805059,25.367401 1.235,-0.158 2.289,0.218 0.019,0.22 0.171,0.853 0.472,1.631 0.177,2.254 -2.241,0.324 -1.712,0.141 -0.176,0.012 -0.216,-5.003 -0.018,-0.492"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Hardin"])) }}
              onMouseEnter={() => setHoveredCounty("Hardin")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Hardin")}
            >
              <title>Hardin County</title>
            </path>
            <path
              id="Lawrence"
              className={`county ${selectedCounty === "Lawrence" ? "county--selected" : ""}`}
              d="m 32.865059,24.079401 0.929,0.064 -0.022,0.346 -0.005,0.333 0.315,3.457 0.06,1.489 -4.008,0.31 -0.135,-5.139 0.424,-0.04 0.87,-0.36 -0.042,-0.482 1.276,-0.1 0.338,0.122"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Lawrence"])) }}
              onMouseEnter={() => setHoveredCounty("Lawrence")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Lawrence")}
            >
              <title>Lawrence County</title>
            </path>
            <path
              id="Wayne"
              className={`county ${selectedCounty === "Wayne" ? "county--selected" : ""}`}
              d="m 28.426059,23.976401 1.573,0.963 0.135,5.139 -3.966,0.307 -0.177,-2.254 -0.472,-1.631 -0.171,-0.853 -0.019,-0.22 0.145,-0.419 2.952,-1.032"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Wayne"])) }}
              onMouseEnter={() => setHoveredCounty("Wayne")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Wayne")}
            >
              <title>Wayne County</title>
            </path>
            <path
              id="Lewis"
              className={`county ${selectedCounty === "Lewis" ? "county--selected" : ""}`}
              d="m 32.150059,21.349401 -0.096,0.548 0.01,0.266 0.036,0.162 0.157,0.14 0.252,0.046 0.285,0.23 0.26,0.523 -0.035,0.468 -0.031,0.153 -0.123,0.194 -0.338,-0.122 -1.276,0.1 0.042,0.482 -0.87,0.36 -0.424,0.04 -1.573,-0.963 0.474,-1.686 0.401,-0.266 0.702,-0.104 0.946,0.113 0.078,-0.018 0.423,-0.22 0.7,-0.446"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Lewis"])) }}
              onMouseEnter={() => setHoveredCounty("Lewis")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Lewis")}
            >
              <title>Lewis County</title>
            </path>
            <path
              id="Perry"
              className={`county ${selectedCounty === "Perry" ? "county--selected" : ""}`}
              d="m 28.030059,19.374401 0.87,2.916 -0.474,1.686 -2.952,1.032 -0.153,0.012 -0.072,-0.036 -0.077,-0.089 -0.099,-0.176 -0.145,-3.282 0.168,-0.585 0.332,-0.951 0.055,-0.334 1.249,0.158 0.257,-0.216 0.184,-0.036 0.857,-0.099"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Perry"])) }}
              onMouseEnter={() => setHoveredCounty("Perry")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Perry")}
            >
              <title>Perry County</title>
            </path>
            <path
              id="Hickman"
              className={`county ${selectedCounty === "Hickman" ? "county--selected" : ""}`}
              d="m 33.186059,17.341401 0.017,1.416 -1.053,2.592 -0.7,0.446 -0.423,0.22 -0.078,0.018 -0.946,-0.113 -0.702,0.104 -0.401,0.266 -0.87,-2.916 1.708,-2.164 3.448,0.131"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Hickman"])) }}
              onMouseEnter={() => setHoveredCounty("Hickman")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Hickman")}
            >
              <title>Hickman County</title>
            </path>
            <path
              id="Humphreys"
              className={`county ${selectedCounty === "Humphreys" ? "county--selected" : ""}`}
              d="m 29.193059,14.849401 0.545,2.361 -1.708,2.164 -0.857,0.099 -0.184,0.036 -0.257,0.216 -1.249,-0.158 0.168,-0.252 0.048,-0.145 0.068,-0.545 0,-0.248 -0.158,-3.024 -0.432,-1.005 1.189,0.041 0.366,-0.194 0.42,0.005 1.82,0.414 0.221,0.235"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Humphreys"])) }}
              onMouseEnter={() => setHoveredCounty("Humphreys")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Humphreys")}
            >
              <title>Humphreys County</title>
            </path>
            <path
              id="Houston"
              className={`county ${selectedCounty === "Houston" ? "county--selected" : ""}`}
              d="m 28.710059,12.419401 0.848,0.351 -0.365,2.079 -0.221,-0.235 -1.82,-0.414 -0.42,-0.005 -0.366,0.194 -1.189,-0.041 -0.446,-1.402 1.117,0.19 0.203,0.013 0.303,-0.017 0.201,-0.036 0.222,-0.069 0.279,-0.139 0.184,-0.13 0.141,-0.127 1.329,-0.212"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Houston"])) }}
              onMouseEnter={() => setHoveredCounty("Houston")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Houston")}
            >
              <title>Houston County</title>
            </path>
            <path
              id="Stewart"
              className={`county ${selectedCounty === "Stewart" ? "county--selected" : ""}`}
              d="m 27.363059,9.0254027 0.541,-0.062 0.806,3.4559983 -1.329,0.212 -0.141,0.127 -0.184,0.13 -0.279,0.139 -0.222,0.069 -0.201,0.036 -0.303,0.017 -0.203,-0.013 -1.117,-0.19 -0.099,-0.086 -0.799,-1.707999 -0.37,-2.3299992 0.601,-0.036 1.676,0.032 -0.004,0.3969999 1.627,-0.19"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Stewart"])) }}
              onMouseEnter={() => setHoveredCounty("Stewart")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Stewart")}
            >
              <title>Stewart County</title>
            </path>
            <path
              id="Montgomery"
              className={`county ${selectedCounty === "Montgomery" ? "county--selected" : ""}`}
              d="m 33.280059,8.4174028 0.172,2.4249992 -1.546,1.883999 -2.348,0.044 -0.848,-0.351 -0.806,-3.4559983 3.119,-0.3249999 2.257,-0.221"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Montgomery"])) }}
              onMouseEnter={() => setHoveredCounty("Montgomery")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Montgomery")}
            >
              <title>Montgomery County</title>
            </path>
            <path
              id="Robertson"
              className={`county ${selectedCounty === "Robertson" ? "county--selected" : ""}`}
              d="m 36.867059,7.9894028 2.056,0 -0.266,0.685 -0.568,1.7029992 -0.229,0.506 -0.595,0.248 -1.601,0.445 -2.212,-0.734 -0.172,-2.4249992 0.554,-0.064 3.033,-0.364"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Robertson"])) }}
              onMouseEnter={() => setHoveredCounty("Robertson")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Robertson")}
            >
              <title>Robertson County</title>
            </path>
            <path
              id="Cheatham"
              className={`county ${selectedCounty === "Cheatham" ? "county--selected" : ""}`}
              d="m 33.452059,10.842402 2.212,0.734 -1.032,4.502999 -1.328,0.067 0.08,-1.843 -0.144,-0.483 -0.208,-0.152 0.28,-0.433 0.018,-0.347 -0.032,-0.073 -0.238,-0.089 -0.533,-0.068 -0.621,0.068 1.546,-1.883999 z m -0.077,2.121999 -0.05,0.063 0.13,-0.058 -0.03,-0.027 -0.018,0.036 -0.032,-0.014"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Cheatham"])) }}
              onMouseEnter={() => setHoveredCounty("Cheatham")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Cheatham")}
            >
              <title>Cheatham County</title>
            </path>
            <path
              id="Dickson"
              className={`county ${selectedCounty === "Dickson" ? "county--selected" : ""}`}
              d="m 29.558059,12.770401 2.348,-0.044 0.621,-0.068 0.533,0.068 0.238,0.089 0.032,0.073 -0.018,0.347 -0.28,0.433 0.208,0.152 0.144,0.483 -0.08,1.843 -0.118,1.195 -3.448,-0.131 -0.545,-2.361 0.365,-2.079"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Dickson"])) }}
              onMouseEnter={() => setHoveredCounty("Dickson")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Dickson")}
            >
              <title>Dickson County</title>
            </path>
            <path
              id="Williamson"
              className={`county ${selectedCounty === "Williamson" ? "county--selected" : ""}`}
              d="m 33.304059,16.146401 1.328,-0.067 0.207,0.716 0.136,-0.018 0.937,-0.914 1.484,0.076 1.82,0.707 -0.365,3.404 -0.986,0.139 -4.662,-1.432 -0.017,-1.416 0.118,-1.195"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Williamson"])) }}
              onMouseEnter={() => setHoveredCounty("Williamson")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Williamson")}
            >
              <title>Williamson County</title>
            </path>
            <path
              id="Maury"
              className={`county ${selectedCounty === "Maury" ? "county--selected" : ""}`}
              d="m 33.203059,18.757401 4.662,1.432 -1.498,3.921 -2.573,0.033 -0.929,-0.064 0.123,-0.194 0.031,-0.153 0.035,-0.468 -0.26,-0.523 -0.285,-0.23 -0.252,-0.046 -0.157,-0.14 -0.036,-0.162 -0.01,-0.266 0.096,-0.548 1.053,-2.592"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Maury"])) }}
              onMouseEnter={() => setHoveredCounty("Maury")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Maury")}
            >
              <title>Maury County</title>
            </path>
            <path
              id="Marshall"
              className={`county ${selectedCounty === "Marshall" ? "county--selected" : ""}`}
              d="m 37.865059,20.189401 0.986,-0.139 0.514,0.265 -0.009,2.534 0.032,0.46 0.103,0.261 0.506,0.847 0.156,0.019 0.036,-0.015 -2.253,1.543 -1.569,-1.854 1.498,-3.921"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Marshall"])) }}
              onMouseEnter={() => setHoveredCounty("Marshall")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Marshall")}
            >
              <title>Marshall County</title>
            </path>
            <path
              id="Giles"
              className={`county ${selectedCounty === "Giles" ? "county--selected" : ""}`}
              d="m 33.794059,24.143401 2.573,-0.033 1.569,1.854 0.258,3.519 -3.922,0.275 -0.13,0.01 -0.06,-1.489 -0.315,-3.457 0.005,-0.333 0.022,-0.346"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Giles"])) }}
              onMouseEnter={() => setHoveredCounty("Giles")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Giles")}
            >
              <title>Giles County</title>
            </path>
            <path
              id="Lincoln"
              className={`county ${selectedCounty === "Lincoln" ? "county--selected" : ""}`}
              d="m 40.974059,24.476401 2.456,2.717 0.173,1.758 -4.861,0.479 -0.548,0.053 -0.258,-3.519 2.253,-1.543 0.785,0.055"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Lincoln"])) }}
              onMouseEnter={() => setHoveredCounty("Lincoln")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Lincoln")}
            >
              <title>Lincoln County</title>
            </path>
            <path
              id="Moore"
              className={`county ${selectedCounty === "Moore" ? "county--selected" : ""}`}
              d="m 43.682059,23.447401 0.063,1.025 -0.315,2.721 -2.456,-2.717 2.708,-1.029"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Moore"])) }}
              onMouseEnter={() => setHoveredCounty("Moore")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Moore")}
            >
              <title>Moore County</title>
            </path>
            <path
              id="Bedford"
              className={`county ${selectedCounty === "Bedford" ? "county--selected" : ""}`}
              d="m 43.520059,20.600401 0.162,2.847 -2.708,1.029 -0.785,-0.055 -0.036,0.015 -0.156,-0.019 -0.506,-0.847 -0.103,-0.261 -0.032,-0.46 0.009,-2.534 0.013,-0.211 0.15,-0.027 0.82,-0.015 2.569,0.29 0.603,0.248"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Bedford"])) }}
              onMouseEnter={() => setHoveredCounty("Bedford")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Bedford")}
            >
              <title>Bedford County</title>
            </path>
            <path
              id="Rutherford"
              className={`county ${selectedCounty === "Rutherford" ? "county--selected" : ""}`}
              d="m 40.114059,14.826401 0.45,0.302 1.65,0.996 0.171,0.067 0.685,0.167 0.968,-0.022 -0.219,3.295 -0.299,0.969 -0.603,-0.248 -2.569,-0.29 -0.82,0.015 -0.15,0.027 -0.013,0.211 -0.514,-0.265 0.365,-3.404 0.898,-1.82"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Rutherford"])) }}
              onMouseEnter={() => setHoveredCounty("Rutherford")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Rutherford")}
            >
              <title>Rutherford County</title>
            </path>
            <path
              id="Davidson"
              className={`county ${selectedCounty === "Davidson" ? "county--selected" : ""}`}
              d="m 35.664059,11.576402 1.601,-0.445 1.851,1.908999 0.998,1.786 -0.898,1.82 -1.82,-0.707 -1.484,-0.076 -0.937,0.914 -0.136,0.018 -0.207,-0.716 1.032,-4.502999"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Davidson"])) }}
              onMouseEnter={() => setHoveredCounty("Davidson")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Davidson")}
            >
              <title>Davidson County</title>
            </path>
            <path
              id="Sumner"
              className={`county ${selectedCounty === "Sumner" ? "county--selected" : ""}`}
              d="m 40.465059,7.6104028 2.127,-0.076 -0.04,1.9909999 -0.374,1.8699993 -0.127,0.47 -0.355,-0.045 -0.141,-0.133 -0.026,-0.197 -0.055,-0.085 -0.112,-0.063 -0.055,0.005 -0.842,0.378 -1.051,0.729999 -0.298,0.585 -1.851,-1.908999 0.595,-0.248 0.229,-0.506 0.568,-1.7029992 0.266,-0.685 1.542,-0.379"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Sumner"])) }}
              onMouseEnter={() => setHoveredCounty("Sumner")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Sumner")}
            >
              <title>Sumner County</title>
            </path>
            <path
              id="Wilson"
              className={`county ${selectedCounty === "Wilson" ? "county--selected" : ""}`}
              d="m 43.750059,11.905401 1.073,2.628 0.635,1.569 -1.42,0.234 -0.968,0.022 -0.685,-0.167 -0.171,-0.067 -1.65,-0.996 -0.45,-0.302 -0.998,-1.786 0.298,-0.585 1.051,-0.729999 0.842,-0.378 0.055,-0.005 0.112,0.063 0.055,0.085 0.026,0.197 0.141,0.133 0.355,0.045 0.127,-0.47 1.572,0.509999"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Wilson"])) }}
              onMouseEnter={() => setHoveredCounty("Wilson")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Wilson")}
            >
              <title>Wilson County</title>
            </path>
            <path
              id="Cannon"
              className={`county ${selectedCounty === "Cannon" ? "county--selected" : ""}`}
              d="m 45.458059,16.102401 1.501,1.424 -0.784,2.429 -2.356,-0.324 0.219,-3.295 1.42,-0.234"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Cannon"])) }}
              onMouseEnter={() => setHoveredCounty("Cannon")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Cannon")}
            >
              <title>Cannon County</title>
            </path>
            <path
              id="Coffee"
              className={`county ${selectedCounty === "Coffee" ? "county--selected" : ""}`}
              d="m 46.175059,19.955401 1.308,1.636 -0.033,0.023 -0.022,0.068 0.036,0.96 0.122,0.648 0.166,0.149 -0.072,0.418 -0.197,0.696 -0.059,0.117 -1.351,-0.572 -1.277,-0.118 -0.947,0.333 -0.099,0.104 -0.005,0.055 -0.063,-1.025 -0.162,-2.847 0.299,-0.969 2.356,0.324"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Coffee"])) }}
              onMouseEnter={() => setHoveredCounty("Coffee")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Coffee")}
            >
              <title>Coffee County</title>
            </path>
            <path
              id="Franklin"
              className={`county ${selectedCounty === "Franklin" ? "county--selected" : ""}`}
              d="m 43.745059,24.472401 0.005,-0.055 0.099,-0.104 0.947,-0.333 1.277,0.118 1.351,0.572 0.514,0.798 0.419,3.024 -4.675,0.455 -0.079,0.004 -0.173,-1.758 0.315,-2.721"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Franklin"])) }}
              onMouseEnter={() => setHoveredCounty("Franklin")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Franklin")}
            >
              <title>Franklin County</title>
            </path>
            <path
              id="Marion"
              className={`county ${selectedCounty === "Marion" ? "county--selected" : ""}`}
              d="m 47.938059,25.468401 3.136,-1.592 0.122,0.181 0.892,0.36 0.267,0.067 0.424,0.424 0.157,0.226 0.157,0.653 0.009,0.108 -0.649,2.209 -1.388,0.144 -2.708,0.244 -0.419,-3.024"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Marion"])) }}
              onMouseEnter={() => setHoveredCounty("Marion")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Marion")}
            >
              <title>Marion County</title>
            </path>
            <path
              id="Sequatchie"
              className={`county ${selectedCounty === "Sequatchie" ? "county--selected" : ""}`}
              d="m 52.115059,20.518401 2.362,2.52 -1.375,2.857 -0.009,-0.108 -0.157,-0.653 -0.157,-0.226 -0.424,-0.424 -0.267,-0.067 -0.892,-0.36 -0.122,-0.181 -0.806,-2.687 0.513,-0.071 1.334,-0.6"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Sequatchie"])) }}
              onMouseEnter={() => setHoveredCounty("Sequatchie")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Sequatchie")}
            >
              <title>Sequatchie County</title>
            </path>
            <path
              id="Grundy"
              className={`county ${selectedCounty === "Grundy" ? "county--selected" : ""}`}
              d="m 50.268059,21.189401 0.806,2.687 -3.136,1.592 -0.514,-0.798 0.059,-0.117 0.197,-0.696 0.072,-0.418 -0.166,-0.149 -0.122,-0.648 -0.036,-0.96 0.022,-0.068 0.033,-0.023 0.468,0.068 0.163,0.004 0.644,-0.212 0.519,-0.112 0.991,-0.15"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Grundy"])) }}
              onMouseEnter={() => setHoveredCounty("Grundy")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Grundy")}
            >
              <title>Grundy County</title>
            </path>
            <path
              id="Van Buren"
              className={`county ${selectedCounty === "Van Buren" ? "county--selected" : ""}`}
              d="m 53.382059,17.431401 -0.022,0.068 0.225,0.248 0,0.018 -1.47,2.753 -1.334,0.6 -0.842,-3.331 3.443,-0.356"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Van Buren"])) }}
              onMouseEnter={() => setHoveredCounty("Van Buren")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Van Buren")}
            >
              <title>Van Buren County</title>
            </path>
            <path
              id="Warren"
              className={`county ${selectedCounty === "Warren" ? "county--selected" : ""}`}
              d="m 49.069059,17.409401 0.87,0.378 0.842,3.331 -0.513,0.071 -0.991,0.15 -0.519,0.112 -0.644,0.212 -0.163,-0.004 -0.468,-0.068 -1.308,-1.636 0.784,-2.429 2.11,-0.117"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Warren"])) }}
              onMouseEnter={() => setHoveredCounty("Warren")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Warren")}
            >
              <title>Warren County</title>
            </path>
            <path
              id="White"
              className={`county ${selectedCounty === "White" ? "county--selected" : ""}`}
              d="m 53.165059,15.020401 0.217,2.411 -3.443,0.356 -0.87,-0.378 0.126,-2.417 0.004,-0.076 0.045,-0.095 0.185,-0.193 0.551,-0.486 0.148,-0.073 0.383,-0.094 1.438,0.225 0.509,0.193 0.158,0.123 0.549,0.504"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["White"])) }}
              onMouseEnter={() => setHoveredCounty("White")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("White")}
            >
              <title>White County</title>
            </path>
            <path
              id="DeKalb"
              className={`county ${selectedCounty === "DeKalb" ? "county--selected" : ""}`}
              d="m 47.356059,13.668401 1.839,1.324 -0.126,2.417 -2.11,0.117 -1.501,-1.424 -0.635,-1.569 2.533,-0.865"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["DeKalb"])) }}
              onMouseEnter={() => setHoveredCounty("DeKalb")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("DeKalb")}
            >
              <title>DeKalb County</title>
            </path>
            <path
              id="Putnam"
              className={`county ${selectedCounty === "Putnam" ? "county--selected" : ""}`}
              d="m 47.491059,12.267401 1.501,0.107 0.65,-0.198 0.319,-0.154 0.068,-0.098 0.297,-0.509999 0,-0.298 0.87,0.767 2.335,0.829999 0.879,0 0.207,0.057 -0.482,0.564 -0.861,0.019 -0.103,0.076 -0.006,1.591 -0.549,-0.504 -0.158,-0.123 -0.509,-0.193 -1.438,-0.225 -0.383,0.094 -0.148,0.073 -0.551,0.486 -0.185,0.193 -0.045,0.095 -0.004,0.076 -1.839,-1.324 0.135,-1.401"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Putnam"])) }}
              onMouseEnter={() => setHoveredCounty("Putnam")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Putnam")}
            >
              <title>Putnam County</title>
            </path>
            <path
              id="Trousdale"
              className={`county ${selectedCounty === "Trousdale" ? "county--selected" : ""}`}
              d="m 45.193059,10.053402 -1.443,1.851999 -1.572,-0.509999 0.374,-1.8699993 2.641,0.5279993"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Trousdale"])) }}
              onMouseEnter={() => setHoveredCounty("Trousdale")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Trousdale")}
            >
              <title>Trousdale County</title>
            </path>
            <path
              id="Macon"
              className={`county ${selectedCounty === "Macon" ? "county--selected" : ""}`}
              d="m 44.940059,7.4354028 1.929,-0.118 -0.09,1.6099999 -0.021,1.1429993 -1.565,-0.017 -2.641,-0.5279993 0.04,-1.9909999 2.348,-0.099"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Macon"])) }}
              onMouseEnter={() => setHoveredCounty("Macon")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Macon")}
            >
              <title>Macon County</title>
            </path>
            <path
              id="Smith"
              className={`county ${selectedCounty === "Smith" ? "county--selected" : ""}`}
              d="m 45.193059,10.053402 1.565,0.017 0.733,2.196999 -0.135,1.401 -2.533,0.865 -1.073,-2.628 1.443,-1.851999"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Smith"])) }}
              onMouseEnter={() => setHoveredCounty("Smith")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Smith")}
            >
              <title>Smith County</title>
            </path>
            <path
              id="Jackson"
              className={`county ${selectedCounty === "Jackson" ? "county--selected" : ""}`}
              d="m 46.779059,8.9274027 0.455,-0.2849999 1.321,0.208 0.694,0.1699999 0.523,0.384 0.406,0.406 0.148,1.3059993 0,0.298 -0.297,0.509999 -0.068,0.098 -0.319,0.154 -0.65,0.198 -1.501,-0.107 -0.733,-2.196999 0.021,-1.1429993"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Jackson"])) }}
              onMouseEnter={() => setHoveredCounty("Jackson")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Jackson")}
            >
              <title>Jackson County</title>
            </path>
            <path
              id="Overton"
              className={`county ${selectedCounty === "Overton" ? "county--selected" : ""}`}
              d="m 52.143059,7.9174028 1.869,1.4109999 0.132,1.3239993 0.176,0.46 0.396,0.892999 -0.306,0.708 -0.879,0 -2.335,-0.829999 -0.87,-0.767 -0.148,-1.3059993 1.965,-1.8929999"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Overton"])) }}
              onMouseEnter={() => setHoveredCounty("Overton")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Overton")}
            >
              <title>Overton County</title>
            </path>
            <path
              id="Clay"
              className={`county ${selectedCounty === "Clay" ? "county--selected" : ""}`}
              d="m 52.093059,6.6784028 0.05,1.239 -1.965,1.8929999 -0.406,-0.406 -0.523,-0.384 -0.694,-0.1699999 -1.321,-0.208 -0.455,0.2849999 0.09,-1.6099999 3.601,-0.346 1.425,-0.258 0.198,-0.035"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Clay"])) }}
              onMouseEnter={() => setHoveredCounty("Clay")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Clay")}
            >
              <title>Clay County</title>
            </path>
            <path
              id="Pickett"
              className={`county ${selectedCounty === "Pickett" ? "county--selected" : ""}`}
              d="m 55.257059,6.4794028 1.884,-0.086 0.667,0.952 -1.401,-0.424 -0.443,-0.068 -0.4,0.018 -0.632,0.198 -0.387,0.383 -0.234,0.384 -0.109,0.252 -0.19,1.2399999 -1.869,-1.4109999 -0.05,-1.239 3.164,-0.199"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Pickett"])) }}
              onMouseEnter={() => setHoveredCounty("Pickett")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Pickett")}
            >
              <title>Pickett County</title>
            </path>
            <path
              id="Bledsoe"
              className={`county ${selectedCounty === "Bledsoe" ? "county--selected" : ""}`}
              d="m 53.585059,17.765401 1.243,-0.194 0.487,0.049 0.573,0.005 0.401,-0.022 0.789,-0.19 -1.095,1.911 -0.6,0.771 -0.279,1.077 0.153,0.424 -0.78,1.442 -2.362,-2.52 1.47,-2.753"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Bledsoe"])) }}
              onMouseEnter={() => setHoveredCounty("Bledsoe")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Bledsoe")}
            >
              <title>Bledsoe County</title>
            </path>
            <path
              id="Fentress"
              className={`county ${selectedCounty === "Fentress" ? "county--selected" : ""}`}
              d="m 57.808059,7.3454028 0.555,1.9469999 -1.577,1.2069993 -0.083,0.107 -0.279,1.042 0.15,0.662999 -1.957,0.459 -0.207,-0.057 0.306,-0.708 -0.396,-0.892999 -0.176,-0.46 -0.132,-1.3239993 0.19,-1.2399999 0.109,-0.252 0.234,-0.384 0.387,-0.383 0.632,-0.198 0.4,-0.018 0.443,0.068 1.401,0.424"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Fentress"])) }}
              onMouseEnter={() => setHoveredCounty("Fentress")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Fentress")}
            >
              <title>Fentress County</title>
            </path>
            <path
              id="Cumberland"
              className={`county ${selectedCounty === "Cumberland" ? "county--selected" : ""}`}
              d="m 54.617059,12.770401 1.957,-0.459 2.708,2.92 -0.915,1.2 -1.289,0.982 -0.789,0.19 -0.401,0.022 -0.573,-0.005 -0.487,-0.049 -1.243,0.194 0,-0.018 -0.225,-0.248 0.022,-0.068 -0.217,-2.411 0.006,-1.591 0.103,-0.076 0.861,-0.019 0.482,-0.564"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Cumberland"])) }}
              onMouseEnter={() => setHoveredCounty("Cumberland")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Cumberland")}
            >
              <title>Cumberland County</title>
            </path>
            <path
              id="Rhea"
              className={`county ${selectedCounty === "Rhea" ? "county--selected" : ""}`}
              d="m 59.079059,17.292401 0.13,0.202 0.032,0.077 -0.041,0.505 -0.558,1.906 -1.068,1.569 -0.069,0.045 -0.931,0.482 -1.317,-0.482 -0.153,-0.424 0.279,-1.077 0.6,-0.771 1.095,-1.911 1.289,-0.982 0.712,0.861"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Rhea"])) }}
              onMouseEnter={() => setHoveredCounty("Rhea")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Rhea")}
            >
              <title>Rhea County</title>
            </path>
            <path
              id="Meigs"
              className={`county ${selectedCounty === "Meigs" ? "county--selected" : ""}`}
              d="m 60.319059,18.558401 -2.038,4.093 -0.802,0.91 -0.905,-1.483 0.931,-0.482 0.069,-0.045 1.068,-1.569 0.558,-1.906 0.041,-0.505 -0.032,-0.077 -0.13,-0.202 1.24,1.266"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Meigs"])) }}
              onMouseEnter={() => setHoveredCounty("Meigs")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Meigs")}
            >
              <title>Meigs County</title>
            </path>
            <path
              id="Hamilton"
              className={`county ${selectedCounty === "Hamilton" ? "county--selected" : ""}`}
              d="m 56.574059,22.078401 0.905,1.483 -0.424,1.176 -0.063,0.235 -0.093,0.756 0.372,1.019 0.344,0.717 -0.032,0.005 -2.971,0.373 -1.027,0.14 -1.132,0.122 0.649,-2.209 1.375,-2.857 0.78,-1.442 1.317,0.482"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Hamilton"])) }}
              onMouseEnter={() => setHoveredCounty("Hamilton")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Hamilton")}
            >
              <title>Hamilton County</title>
            </path>
            <path
              id="Bradley"
              className={`county ${selectedCounty === "Bradley" ? "county--selected" : ""}`}
              d="m 58.281059,22.651401 1.793,1.212 -0.365,3.353 -0.359,0.045 -1.735,0.203 -0.344,-0.717 -0.372,-1.019 0.093,-0.756 0.063,-0.235 0.424,-1.176 0.802,-0.91"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Bradley"])) }}
              onMouseEnter={() => setHoveredCounty("Bradley")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Bradley")}
            >
              <title>Bradley County</title>
            </path>
            <path
              id="Polk"
              className={`county ${selectedCounty === "Polk" ? "county--selected" : ""}`}
              d="m 62.166059,23.028401 2.237,0.758 0.039,2.849 -3.123,0.384 -1.61,0.197 0.365,-3.353 0.285,-0.248 0.492,-0.194 1.131,-0.117 0.184,-0.276"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Polk"])) }}
              onMouseEnter={() => setHoveredCounty("Polk")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Polk")}
            >
              <title>Polk County</title>
            </path>
            <path
              id="Monroe"
              className={`county ${selectedCounty === "Monroe" ? "county--selected" : ""}`}
              d="m 64.834059,18.448401 0.086,0.142 1.086,0.617 0.51,-0.095 1.087,0.582 0.012,0.013 -0.012,0.05 -0.177,0.284 -0.423,2.312 -0.244,0.333 -0.395,0.325 -1.111,0.027 -0.85,0.748 -2.237,-0.758 0.811,-0.684 -0.094,-0.879 -1.067,-1.866 -0.434,-0.689 -0.014,-0.14 -0.044,-0.068 0.347,-0.451 0.298,-0.171 0.233,-0.107 0.072,-0.015 1.042,-0.031 1.461,0.428 0.057,0.093 z"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Monroe"])) }}
              onMouseEnter={() => setHoveredCounty("Monroe")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Monroe")}
            >
              <title>Monroe County</title>
            </path>
            <path
              id="McMinn"
              className={`county ${selectedCounty === "McMinn" ? "county--selected" : ""}`}
              d="m 60.684059,18.518401 0.64,0.184 0.044,0.068 0.014,0.14 0.434,0.689 1.067,1.866 0.094,0.879 -0.811,0.684 -0.184,0.276 -1.131,0.117 -0.492,0.194 -0.285,0.248 -1.793,-1.212 2.038,-4.093 0.365,-0.04"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["McMinn"])) }}
              onMouseEnter={() => setHoveredCounty("McMinn")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("McMinn")}
            >
              <title>McMinn County</title>
            </path>
            <path
              id="Roane"
              className={`county ${selectedCounty === "Roane" ? "county--selected" : ""}`}
              d="m 61.102059,18.125401 -0.418,0.393 -0.365,0.04 -1.24,-1.266 -0.712,-0.861 0.915,-1.2 1.497,-1.045 0.796,-0.249 0.343,-0.305 0.631,-0.636 0.942,1.7 0.109,0.161 -0.194,-0.058 -0.487,0.193 -1.64,2.57 -0.177,0.563 z m 0,0 0,0"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Roane"])) }}
              onMouseEnter={() => setHoveredCounty("Roane")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Roane")}
            >
              <title>Roane County</title>
            </path>
            <path
              id="Morgan"
              className={`county ${selectedCounty === "Morgan" ? "county--selected" : ""}`}
              d="m 61.351059,11.644402 1.198,1.351999 -0.631,0.636 -0.343,0.305 -0.796,0.249 -1.497,1.045 -2.708,-2.92 -0.15,-0.662999 0.279,-1.042 0.083,-0.107 1.577,-1.2069993 1.077,1.1849993 0.482,0.361 1.054,0.395 0.375,0.411"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Morgan"])) }}
              onMouseEnter={() => setHoveredCounty("Morgan")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Morgan")}
            >
              <title>Morgan County</title>
            </path>
            <path
              id="Scott"
              className={`county ${selectedCounty === "Scott" ? "county--selected" : ""}`}
              d="m 57.217059,6.3894028 5.292,-0.496 -0.063,1.131 -0.434,3.1009992 -0.043,0.749 -0.618,0.77 -0.375,-0.411 -1.054,-0.395 -0.482,-0.361 -1.077,-1.1849993 -0.555,-1.9469999 -0.667,-0.952 0.076,-0.004"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Scott"])) }}
              onMouseEnter={() => setHoveredCounty("Scott")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Scott")}
            >
              <title>Scott County</title>
            </path>
            <path
              id="Campbell"
              className={`county ${selectedCounty === "Campbell" ? "county--selected" : ""}`}
              d="m 65.304059,5.5734028 1.117,2.077 -0.248,0.37 -0.252,1.2899999 -0.113,0.22 -0.153,0.181 -3.686,1.1629993 0.043,-0.749 0.434,-3.1009992 0.063,-1.131 0.352,-0.04 2.443,-0.28"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Campbell"])) }}
              onMouseEnter={() => setHoveredCounty("Campbell")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Campbell")}
            >
              <title>Campbell County</title>
            </path>
            <path
              id="Anderson"
              className={`county ${selectedCounty === "Anderson" ? "county--selected" : ""}`}
              d="m 65.655059,9.7114027 0.779,0.9999993 -0.027,0 -0.18,0.167 -1.095,1.451999 0.014,0.166 0.229,0.401 -1.703,1.681 -0.181,0.118 -0.942,-1.7 -1.198,-1.351999 0.618,-0.77 3.686,-1.1629993"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Anderson"])) }}
              onMouseEnter={() => setHoveredCounty("Anderson")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Anderson")}
            >
              <title>Anderson County</title>
            </path>
            <path
              id="Loudon"
              className={`county ${selectedCounty === "Loudon" ? "county--selected" : ""}`}
              d="m 63.600059,14.857401 1.149,1.055 0.085,2.536 -0.057,-0.093 -1.461,-0.428 -1.042,0.031 -0.072,0.015 -0.233,0.107 -0.298,0.171 -0.347,0.451 -0.64,-0.184 0.418,-0.393 0.177,-0.563 1.64,-2.57 0.487,-0.193 0.194,0.058"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Loudon"])) }}
              onMouseEnter={() => setHoveredCounty("Loudon")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Loudon")}
            >
              <title>Loudon County</title>
            </path>
            <path
              id="Blount"
              className={`county ${selectedCounty === "Blount" ? "county--selected" : ""}`}
              d="m 68.445059,14.371401 0.879,1.52 0.441,0.662 0.36,0.171 0.203,1.563 -2.816,1.784 -0.086,-0.03 0.177,-0.284 0.012,-0.05 -0.012,-0.013 -1.087,-0.582 -0.51,0.095 -1.086,-0.617 -0.086,-0.142 -0.085,-2.536 0.158,-0.51 1.451,-0.724 0.549,0.04 0.65,0.325 0.149,0 0.739,-0.672"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Blount"])) }}
              onMouseEnter={() => setHoveredCounty("Blount")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Blount")}
            >
              <title>Blount County</title>
            </path>
            <path
              id="Sevier"
              className={`county ${selectedCounty === "Sevier" ? "county--selected" : ""}`}
              d="m 73.403059,13.604401 0.882,2.249 0.045,0.245 -0.374,0.548 -1.789,1.416 -0.127,0.082 -1.473,0.152 -0.189,-0.004 -0.05,-0.005 -0.203,-1.563 -0.36,-0.171 -0.441,-0.662 -0.879,-1.52 0.991,-2.109 0.713,0.202 2.104,0.839 1.15,0.301"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Sevier"])) }}
              onMouseEnter={() => setHoveredCounty("Sevier")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Sevier")}
            >
              <title>Sevier County</title>
            </path>
            <path
              id="Knox"
              className={`county ${selectedCounty === "Knox" ? "county--selected" : ""}`}
              d="m 68.617059,10.715402 0.806,0.992 0.013,0.554999 -0.991,2.109 -0.739,0.672 -0.149,0 -0.65,-0.325 -0.549,-0.04 -1.451,0.724 -0.158,0.51 -1.149,-1.055 -0.109,-0.161 0.181,-0.118 1.703,-1.681 -0.229,-0.401 -0.014,-0.166 1.095,-1.451999 0.18,-0.167 0.027,0 2.183,0.004"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Knox"])) }}
              onMouseEnter={() => setHoveredCounty("Knox")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Knox")}
            >
              <title>Knox County</title>
            </path>
            <path
              id="Union"
              className={`county ${selectedCounty === "Union" ? "county--selected" : ""}`}
              d="m 66.421059,7.6504028 0.288,-0.13 0.708,-0.203 0.059,0.032 0.689,0.744 0.816,0.215 -0.364,2.4069992 -2.183,-0.004 -0.779,-0.9999993 0.153,-0.181 0.113,-0.22 0.252,-1.2899999 0.248,-0.37"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Union"])) }}
              onMouseEnter={() => setHoveredCounty("Union")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Union")}
            >
              <title>Union County</title>
            </path>
            <path
              id="Claiborne"
              className={`county ${selectedCounty === "Claiborne" ? "county--selected" : ""}`}
              d="m 68.468059,5.0194028 2.077,-0.23 1.191,2.258 -2.755,1.261 -0.816,-0.215 -0.689,-0.744 -0.059,-0.032 -0.708,0.203 -0.288,0.13 -1.117,-2.077 0.581,-0.058 2.583,-0.496"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Claiborne"])) }}
              onMouseEnter={() => setHoveredCounty("Claiborne")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Claiborne")}
            >
              <title>Claiborne County</title>
            </path>
            <path
              id="Hancock"
              className={`county ${selectedCounty === "Hancock" ? "county--selected" : ""}`}
              d="m 77.089059,3.9464028 -1.131,0.824 -0.266,-0.031 -0.342,-0.158 -0.045,0.009 -0.374,0.265 -0.496,0.403 -0.469,0.558 -1.118,1.321 -1.112,-0.09 -1.191,-2.258 4.971,-0.627 1.573,-0.216"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Hancock"])) }}
              onMouseEnter={() => setHoveredCounty("Hancock")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Hancock")}
            >
              <title>Hancock County</title>
            </path>
            <path
              id="Grainger"
              className={`county ${selectedCounty === "Grainger" ? "county--selected" : ""}`}
              d="m 71.736059,7.0474028 1.112,0.09 0.442,1.325 -1.968,1.7669992 -1.899,1.478 -0.806,-0.992 0.364,-2.4069992 2.755,-1.261"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Grainger"])) }}
              onMouseEnter={() => setHoveredCounty("Grainger")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Grainger")}
            >
              <title>Grainger County</title>
            </path>
            <path
              id="Hamblen"
              className={`county ${selectedCounty === "Hamblen" ? "county--selected" : ""}`}
              d="m 75.143059,8.8274028 -0.749,0.9049999 -0.536,1.3299993 -2.536,-0.833 1.968,-1.7669992 1.853,0.365"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Hamblen"])) }}
              onMouseEnter={() => setHoveredCounty("Hamblen")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Hamblen")}
            >
              <title>Hamblen County</title>
            </path>
            <path
              id="Jefferson"
              className={`county ${selectedCounty === "Jefferson" ? "county--selected" : ""}`}
              d="m 73.858059,11.062402 -0.455,2.541999 -1.15,-0.301 -2.104,-0.839 -0.713,-0.202 -0.013,-0.554999 1.899,-1.478 2.536,0.833"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Jefferson"])) }}
              onMouseEnter={() => setHoveredCounty("Jefferson")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Jefferson")}
            >
              <title>Jefferson County</title>
            </path>
            <path
              id="Cocke"
              className={`county ${selectedCounty === "Cocke" ? "county--selected" : ""}`}
              d="m 74.394059,9.7324027 -0.027,0.3069993 0.073,0.082 0.404,0.298 0.897,0.481 1.145,0.893 0.666,0.599999 -0.399,2.033 -2.868,1.427 -0.882,-2.249 0.455,-2.541999 0.536,-1.3299993"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Cocke"])) }}
              onMouseEnter={() => setHoveredCounty("Cocke")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Cocke")}
            >
              <title>Cocke County</title>
            </path>
            <path
              id="Unicoi"
              className={`county ${selectedCounty === "Unicoi" ? "county--selected" : ""}`}
              d="m 82.714059,7.6244028 1.389,1.055 -1.839,1.3699992 -0.734,1.343 -1.11,-0.645 -0.022,-0.739 0.59,-0.7759993 0.401,-0.144 0.239,-0.027 0.446,-0.2879999 0.324,-0.482 0.316,-0.667"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Unicoi"])) }}
              onMouseEnter={() => setHoveredCounty("Unicoi")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Unicoi")}
            >
              <title>Unicoi County</title>
            </path>
            <path
              id="Hawkins"
              className={`county ${selectedCounty === "Hawkins" ? "county--selected" : ""}`}
              d="m 79.343059,3.6264028 -0.433,2.19 -0.185,0.307 -1.077,0.748 -0.495,0.145 -0.19,0.103 -0.522,0.333 -0.231,0.267 -0.193,0.346 -0.239,0.276 -0.437,0.391 -0.113,0.086 -0.085,0.009 -1.853,-0.365 -0.442,-1.325 1.118,-1.321 0.469,-0.558 0.496,-0.403 0.374,-0.265 0.045,-0.009 0.342,0.158 0.266,0.031 1.131,-0.824 2.254,-0.32"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Hawkins"])) }}
              onMouseEnter={() => setHoveredCounty("Hawkins")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Hawkins")}
            >
              <title>Hawkins County</title>
            </path>
            <path
              id="Greene"
              className={`county ${selectedCounty === "Greene" ? "county--selected" : ""}`}
              d="m 78.725059,6.1234028 0.709,-0.207 0.03,0.09 0.235,2.74 0.108,0.7119999 0.591,0.5499993 0.022,0.739 -0.197,-0.189 0,-0.005 -0.155,-0.098 -0.049,0.008 -0.262,0.189 -0.181,0.131 -0.648,0.64 -0.91,0.851999 -0.466,0.118 -0.666,-0.599999 -1.145,-0.893 -0.897,-0.481 -0.404,-0.298 -0.073,-0.082 0.027,-0.3069993 0.749,-0.9049999 0.085,-0.009 0.113,-0.086 0.437,-0.391 0.239,-0.276 0.193,-0.346 0.231,-0.267 0.522,-0.333 0.19,-0.103 0.495,-0.145 1.077,-0.748"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Greene"])) }}
              onMouseEnter={() => setHoveredCounty("Greene")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Greene")}
            >
              <title>Greene County</title>
            </path>
            <path
              id="Washington"
              className={`county ${selectedCounty === "Washington" ? "county--selected" : ""}`}
              d="m 78.910059,5.8164028 0.568,-0.089 1.266,-0.249 0.614,-0.194 0.355,0.072 0.51,0.371 0.162,0.048 0.473,-0.062 -0.144,1.911 -0.316,0.667 -0.324,0.482 -0.446,0.2879999 -0.239,0.027 -0.401,0.144 -0.59,0.7759993 -0.591,-0.5499993 -0.108,-0.7119999 -0.235,-2.74 -0.03,-0.09 -0.709,0.207 0.185,-0.307"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Washington"])) }}
              onMouseEnter={() => setHoveredCounty("Washington")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Washington")}
            >
              <title>Washington County</title>
            </path>
            <path
              id="Carter"
              className={`county ${selectedCounty === "Carter" ? "county--selected" : ""}`}
              d="m 85.869059,3.8074028 0.397,0.396 0,0.04 -0.798,1.348 0.157,0.31 0.703,0.732 0.343,0.293 0.181,-0.069 -1.212,2.2669999 -1.537,-0.4449999 -1.389,-1.055 0.144,-1.911 3.011,-1.906"
              style={{ "--county-fill": getCountyColor(getCameraCount(countyData["Carter"])) }}
              onMouseEnter={() => setHoveredCounty("Carter")}
              onMouseLeave={() => setHoveredCounty(null)}
              onClick={() => handleCountySelect("Carter")}
            >
              <title>Carter County</title>
            </path>
          </g>
        </svg>
        <div className="county-map-legend" aria-label="Camera count color scale">
          <span><i className="county-map-legend__zero" />0</span>
          <span><i className="county-map-legend__1-5" />1–5</span>
          <span><i className="county-map-legend__6-15" />6–15</span>
          <span><i className="county-map-legend__16-30" />16–30</span>
          <span><i className="county-map-legend__31-60" />31–60</span>
          <span><i className="county-map-legend__61-125" />61–125</span>
          <span><i className="county-map-legend__126-250" />126–250</span>
          <span><i className="county-map-legend__251-plus" />251+</span>
        </div>
            <div className="county-map-actions">
      <button
        type="button"
        onClick={onJoinEmailUpdates}
      >
        Join email updates
      </button>
    </div>
      </div>



      <aside className="county-details-panel" aria-live="polite">
        <p className="county-details-panel__eyebrow">
          {isStatewide ? "Statewide Overview" : "Selected county"}
        </p>
        <h2>{isStatewide ? "Tennessee" : `${activeCounty} County`}</h2>

        {!isStatewide && selectedCounty && (
          <button
            className="statewide-overview-button statewide-overview-button--panel"
            type="button"
            onClick={() => handleCountySelect(null)}
          >
            Return to statewide overview
          </button>
        )}

        <dl className="county-details-list">
          {isStatewide ? (
            <div className="statewide-metrics">
              <div><dt>Claimed counties</dt><dd>{statewideMetrics.claimed.toLocaleString()}</dd></div>
              <div><dt>Unclaimed counties</dt><dd>{statewideMetrics.unclaimed.toLocaleString()}</dd></div>
              <div><dt>Documented cameras</dt><dd>{statewideMetrics.cameras.toLocaleString()}</dd></div>
              <div><dt>Documented drones</dt><dd>{statewideMetrics.drones.toLocaleString()}</dd></div>
            </div>
          ) : (
            <>
              <div>
                <dt>Cities</dt>
                <dd>{activeCountyData.cities?.join(", ") || "Not yet documented"}</dd>
              </div>
              <div>
                <dt>Camera count</dt>
                <dd>{getCameraCount(activeCountyData) ?? "Unknown"}</dd>
              </div>
              <div>
                <dt>Drone count</dt>
                <dd>{getDroneCount(activeCountyData) ?? "Unknown"}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Next meeting date and location</dt>
            <dd className="county-meeting-details">
              <span>{meeting.dateLabel} at {meeting.timeLabel}</span>
              <span>{meeting.location}</span>
              <a
                href={meeting.calendarHref}
                download={`${(activeCounty || "Tennessee").toLowerCase().replace(/\s+/g, "-")}-chapter-meeting.ics`}
              >
                Add to calendar
              </a>
            </dd>
          </div>
        </dl>

        {!isStatewide && <div className="county-detail-actions">
          <Link className="county-status-button" to={countyStatusPath}>
            View status
          </Link>
          {hasActiveChapter ? (
            <span className="county-active-chapter">Active chapter</span>
          ) : (
            <Link className="county-claim-button" to={countyClaimPath}>
              Claim chapter
            </Link>
          )}
        </div>}
      </aside>
    <div className="county-map-actions">

</div>
    </section>
    
  );
}

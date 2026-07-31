import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import TennesseeCountyMap from "./TennesseeCountyMap";
import CountyContactForm from "../CountyContactForm";
import "./TennesseeCountyMapContainer.css";

export default function TennesseeCountyMapContainer({
  contactFormOpen,
  onContactFormOpenChange,
}) {
  const [counties, setCounties] = useState([]);
  const [selectedCountyName, setSelectedCountyName] =
    useState("Rutherford");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCounties() {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("counties")
        .select(
          "id, name, slug, cities, camera_count, drone_count, subscriber_count, next_meeting_at, meeting_location, chapter_status, chapter_contact_email"
        )
        .order("name");

      if (!active) return;

      if (error) {
        console.error("County request failed:", error);
        setErrorMessage(error.message);
        setCounties([]);
      } else {
        setCounties(data ?? []);
      }

      setLoading(false);
    }

    loadCounties();

    return () => {
      active = false;
    };
  }, []);

  const countyData = useMemo(() => {
    return counties.reduce((result, county) => {
      const countyName = county.name.replace(/\s+County$/i, "");

      result[countyName] = {
        id: county.id,
        name: county.name,
        slug: county.slug,
        cities: Array.isArray(county.cities) ? county.cities : [],
        camera_count: county.camera_count,
        drone_count: county.drone_count,
        subscriber_count: county.subscriber_count,
        next_meeting_at: county.next_meeting_at,
        meeting_location: county.meeting_location,
        chapter_status: county.chapter_status,
        chapter_contact_email: county.chapter_contact_email,
      };

      return result;
    }, {});
  }, [counties]);

  const selectedCounty =
    countyData[selectedCountyName] ?? null;

  function handleCountySelect(countyName) {
    setSelectedCountyName(countyName);
  }

  function handleOpenContactForm() {
    if (!selectedCounty) return;

    onContactFormOpenChange(true);
  }

  if (loading) {
    return <p>Loading county data...</p>;
  }

  if (errorMessage) {
    return (
      <p role="alert">
        County data could not be loaded: {errorMessage}
      </p>
    );
  }

  return (
    <section className="county-map-container">
      <TennesseeCountyMap
        countyData={countyData}
        initialCounty="Rutherford"
        selectedCounty={selectedCountyName}
        onCountySelect={handleCountySelect}
        onJoinEmailUpdates={handleOpenContactForm}
      />

      {selectedCounty && (
        <CountyContactForm
          key={selectedCounty.id}
          initialCountyId={selectedCounty.id}
          initialCountyName={selectedCounty.name}
          isOpen={contactFormOpen}
          onOpenChange={onContactFormOpenChange}
        />
      )}
    </section>
  );
}

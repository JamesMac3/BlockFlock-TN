import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import ChapterLinkButton from "./ChapterLinkButton";

// Renders only the rows a chapter master actually saved — no placeholders,
// no empty slots, no "no links yet" message. Same "render nothing when
// there's nothing to show" convention as NextMeetingBanner.
export default function ChapterLinkButtons({ countyId }) {
  const [links, setLinks] = useState([]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!countyId) {
        if (active) setLinks([]);
        return;
      }
      const { data, error } = await supabase
        .from("county_chapter_links")
        .select("county_id,slot,label,url,color")
        .eq("county_id", countyId)
        .order("slot");
      if (!active) return;
      if (error) {
        console.error("Failed to load chapter links:", error);
        setLinks([]);
        return;
      }
      setLinks(data ?? []);
    }

    load();
    return () => {
      active = false;
    };
  }, [countyId]);

  if (!links.length) return null;

  return (
    <div className="chapter-link-buttons" aria-label="Chapter links">
      {links.map((link) => (
        <ChapterLinkButton key={link.slot} label={link.label} url={link.url} color={link.color} />
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import CountyStatisticsPanel from "../portal/CountyStatisticsPanel";

// Admins may view/edit any county's statistics (chapter masters use
// CountyStatisticsPanel directly, fixed to their own assigned county) —
// this wrapper only adds the county picker admins need.
export default function AdminCountyStatisticsWorkspace() {
  const [counties, setCounties] = useState([]);
  const [countyId, setCountyId] = useState("");

  useEffect(() => {
    let active = true;
    async function loadCounties() {
      const { data } = await supabase.from("counties").select("id, name").order("name");
      if (active) setCounties(data ?? []);
    }
    loadCounties();
    return () => { active = false; };
  }, []);

  const selectedCounty = counties.find((county) => String(county.id) === countyId);

  return (
    <div className="admin-county-statistics-workspace">
      <label htmlFor="admin-stats-county-select">County</label>
      <select
        id="admin-stats-county-select"
        value={countyId}
        onChange={(event) => setCountyId(event.target.value)}
      >
        <option value="">Select a county…</option>
        {counties.map((county) => <option key={county.id} value={county.id}>{county.name}</option>)}
      </select>

      {countyId && <CountyStatisticsPanel countyId={Number(countyId)} countyName={selectedCounty?.name} />}
    </div>
  );
}

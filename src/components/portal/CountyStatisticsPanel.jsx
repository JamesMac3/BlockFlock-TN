import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { classifyRpcError, RPC_ERROR_MESSAGES } from "../../features/portal-admin/rpcErrors";
import "./CountyStatisticsPanel.css";

const MAX_COUNT = 100000;

// Camera/drone counts are genuinely editable by an authorized caller;
// subscriber_count is always a read-only, aggregate-only number sourced
// from a security-definer RPC — this panel never selects, displays, or
// edits any individual newsletter subscriber row or email address.
export default function CountyStatisticsPanel({ countyId, countyName }) {
  const [loadState, setLoadState] = useState("loading");
  const [errorKind, setErrorKind] = useState(null);
  const [stats, setStats] = useState(null);
  const [cameraCount, setCameraCount] = useState("");
  const [droneCount, setDroneCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  const load = useCallback(async () => {
    if (!countyId) return;
    setLoadState("loading");
    setErrorKind(null);
    const { data, error } = await supabase.rpc("rrg_get_county_statistics", { p_county_id: countyId });
    if (error) {
      console.error("Failed to load county statistics:", error);
      setErrorKind(classifyRpcError(error));
      setLoadState("error");
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setStats(row ?? null);
    setCameraCount(String(row?.camera_count ?? 0));
    setDroneCount(String(row?.drone_count ?? 0));
    setLoadState("ready");
  }, [countyId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function handleSave(event) {
    event.preventDefault();
    setSaveError("");
    setSavedAt(null);

    const cameras = Number(cameraCount);
    const drones = Number(droneCount);
    if (!Number.isInteger(cameras) || cameras < 0 || cameras > MAX_COUNT) {
      setSaveError(`Camera count must be a whole number between 0 and ${MAX_COUNT}.`);
      return;
    }
    if (!Number.isInteger(drones) || drones < 0 || drones > MAX_COUNT) {
      setSaveError(`Drone count must be a whole number between 0 and ${MAX_COUNT}.`);
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("rrg_update_county_statistics", {
      p_county_id: countyId,
      p_camera_count: cameras,
      p_drone_count: drones,
    });
    setSaving(false);
    if (error) {
      const classified = classifyRpcError(error);
      setSaveError(classified === "missing-migration" ? RPC_ERROR_MESSAGES["missing-migration"] : error.message);
      return;
    }
    setSavedAt(Date.now());
    load();
  }

  if (loadState === "loading") {
    return (
      <div className="county-statistics-panel">
        <h2>County Statistics</h2>
        <p role="status">Loading county statistics…</p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="county-statistics-panel">
        <h2>County Statistics</h2>
        <p className="county-statistics-panel__error" role="alert">
          {RPC_ERROR_MESSAGES[errorKind] ?? RPC_ERROR_MESSAGES.network}
        </p>
        <button type="button" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="county-statistics-panel">
      <h2>County Statistics{countyName ? ` — ${countyName}` : ""}</h2>

      <dl className="county-statistics-panel__summary">
        <div>
          <dt>Newsletter subscribers</dt>
          <dd>{stats?.subscriber_count ?? 0}</dd>
        </div>
      </dl>

      <form onSubmit={handleSave} className="county-statistics-panel__form">
        <label htmlFor="county-stats-cameras">Documented camera count</label>
        <input
          id="county-stats-cameras"
          type="number"
          min="0"
          max={MAX_COUNT}
          step="1"
          value={cameraCount}
          onChange={(event) => setCameraCount(event.target.value)}
          required
        />

        <label htmlFor="county-stats-drones">Documented drone count</label>
        <input
          id="county-stats-drones"
          type="number"
          min="0"
          max={MAX_COUNT}
          step="1"
          value={droneCount}
          onChange={(event) => setDroneCount(event.target.value)}
          required
        />

        {saveError && <p className="county-statistics-panel__error" role="alert">{saveError}</p>}
        {savedAt && !saveError && <p className="county-statistics-panel__success" role="status">Saved.</p>}

        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save counts"}</button>
      </form>
    </div>
  );
}

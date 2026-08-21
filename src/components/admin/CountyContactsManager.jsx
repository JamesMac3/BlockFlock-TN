import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { classifyRpcError } from "../../features/portal-admin/rpcErrors";
import { clampPageSize, resetPageOnQueryChange } from "../../features/portal-admin/pagination";
import AdminStatePanel from "./AdminStatePanel";
import AdminPagination from "./AdminPagination";
import "./ContentManagementTable.css";

const SORT_OPTIONS = [
  ["county", "County"],
  ["email", "Email"],
  ["created_at", "Date added"],
];

export default function CountyContactsManager() {
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadState, setLoadState] = useState("loading");
  const [errorKind, setErrorKind] = useState(null);
  const [criteria, setCriteria] = useState({
    search: "", countyId: "", sort: "county", sortDirection: "asc", page: 1, pageSize: 25,
  });

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorKind(null);
    const { data, error } = await supabase.rpc("rrg_admin_list_county_contacts", {
      p_search: criteria.search || null,
      p_county_id: criteria.countyId ? Number(criteria.countyId) : null,
      p_sort: criteria.sort,
      p_sort_direction: criteria.sortDirection,
      p_page: criteria.page,
      p_page_size: clampPageSize(criteria.pageSize),
    });

    if (error) {
      console.error("Failed to load county contacts:", error);
      setErrorKind(classifyRpcError(error));
      setLoadState("error");
      return;
    }

    const loadedRows = data ?? [];
    setRows(loadedRows);
    setTotalCount(loadedRows[0]?.total_count ?? 0);
    if (loadedRows.length === 0) {
      setLoadState(criteria.search || criteria.countyId ? "no-matches" : "empty");
    } else {
      setLoadState("ready");
    }
  }, [criteria]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function updateCriteria(changes) {
    setCriteria((current) => resetPageOnQueryChange(current, changes));
  }

  return (
    <div className="content-management">
      <h2>Contact Emails / Phone Numbers</h2>

      <div className="management-toolbar">
        <label>
          Search
          <input
            type="search"
            value={criteria.search}
            onChange={(event) => updateCriteria({ search: event.target.value })}
            placeholder="Search email, phone, or county"
          />
        </label>
        <label>
          Sort by
          <select value={criteria.sort} onChange={(event) => updateCriteria({ sort: event.target.value })}>
            {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Direction
          <select value={criteria.sortDirection} onChange={(event) => updateCriteria({ sortDirection: event.target.value })}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>

      {loadState === "loading" || loadState === "error" || loadState === "empty" || loadState === "no-matches" ? (
        <AdminStatePanel
          state={loadState}
          errorKind={errorKind}
          onRetry={load}
          emptyMessage="No contacts recorded yet."
          noMatchesMessage="No contacts match the current filters."
        />
      ) : (
        <>
          <table className="management-table">
            <thead>
              <tr>
                <th>County</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Date added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((contact, index) => (
                <tr key={`${contact.county_id}-${contact.email ?? "no-email"}-${index}`}>
                  <td>{contact.county_name}</td>
                  <td>{contact.email || "—"}</td>
                  <td>{contact.phone || "—"}</td>
                  <td>{contact.created_at ? new Date(contact.created_at).toLocaleDateString() : "Not recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <AdminPagination
            page={criteria.page}
            pageSize={clampPageSize(criteria.pageSize)}
            totalCount={totalCount}
            onPageChange={(page) => setCriteria((current) => ({ ...current, page }))}
            onPageSizeChange={(pageSize) => updateCriteria({ pageSize })}
          />
        </>
      )}
    </div>
  );
}

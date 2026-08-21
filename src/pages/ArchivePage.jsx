import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { supabase } from "../lib/supabase";
import { listDocumentsByCategory } from "../config/documentManifest";
import { classifyRpcError, RPC_ERROR_MESSAGES } from "../features/portal-admin/rpcErrors";
import "./ArchivePage.css";

const PAGE_SIZE_CHOICES = [5, 10, 25];
const DEFAULT_PAGE_SIZE = 5;
const GOAL_SORT_OPTIONS = [
  ["updated_at", "Updated date"],
  ["title", "Goal title"],
  ["county", "County"],
];

const BLANK_REQUEST_TEMPLATES = listDocumentsByCategory("blank_request_template");

// The investigative goal is the primary public-archive row, never an
// individual document — this table sources from get_public_archive_goals()
// (one row per public goal, Partial/received and Complete/published alike),
// completely separate from the static blank-template manifest below.
export default function ArchivePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("goals");
  const [phase, setPhase] = useState("loading");
  const [errorKind, setErrorKind] = useState(null);
  const [goalRows, setGoalRows] = useState([]);
  const [search, setSearch] = useState("");
  const [county, setCounty] = useState("all");
  const [sortKey, setSortKey] = useState("updated_at");
  const [sortDirection, setSortDirection] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    let active = true;

    async function loadArchive() {
      setPhase("loading");
      setErrorKind(null);
      const { data, error } = await supabase.rpc("get_public_archive_goals");
      if (!active) return;
      if (error) {
        console.error("Public archive request failed:", error);
        setErrorKind(classifyRpcError(error));
        setPhase("failed");
        return;
      }
      setGoalRows(data ?? []);
      setPhase("done");
    }

    loadArchive();
    return () => {
      active = false;
    };
  }, []);

  const counties = useMemo(
    () => [...new Set(goalRows.map((row) => row.county).filter(Boolean))].sort(),
    [goalRows]
  );

  const filteredSorted = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = goalRows.filter((row) => {
      if (county !== "all" && row.county !== county) return false;
      if (!query) return true;
      return [row.title, row.county, row.government_entity, row.public_summary]
        .some((value) => typeof value === "string" && value.toLowerCase().includes(query));
    });
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "title") return factor * (a.title ?? "").localeCompare(b.title ?? "");
      if (sortKey === "county") return factor * (a.county ?? "").localeCompare(b.county ?? "");
      return factor * ((a.updated_at ?? "").localeCompare(b.updated_at ?? ""));
    });
  }, [goalRows, search, county, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredSorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function updateFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  function handlePageSizeChange(nextPageSize) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  return (
    <div className="site-shell">
      <Header />
      <main className="archive-page">
        <div className="archive-page__inner">
          <header className="archive-header">
            <h1>Public Records Archive</h1>
            <p className="archive-intro">
              Investigative records requests and the records and sources they have produced,
              alongside the blank official request forms used to start new requests.
            </p>
          </header>

          <div className="archive-tabs" role="tablist" aria-label="Archive sections">
            <button type="button" role="tab" aria-selected={activeTab === "goals"} className={activeTab === "goals" ? "is-active" : ""} onClick={() => setActiveTab("goals")}>
              Investigative Goals
            </button>
            <button type="button" role="tab" aria-selected={activeTab === "templates"} className={activeTab === "templates" ? "is-active" : ""} onClick={() => setActiveTab("templates")}>
              Blank Request Forms
            </button>
          </div>

          {activeTab === "goals" ? (
            <>
              {phase === "loading" && <p className="archive-message-inline">Loading archive goals…</p>}
              {phase === "failed" && (
                <p className="archive-message-inline" role="alert">
                  {RPC_ERROR_MESSAGES[errorKind] ?? RPC_ERROR_MESSAGES.network}
                </p>
              )}
              {phase === "done" && (
                <>
                  <div className="archive-toolbar">
                    <label>
                      Search
                      <input
                        type="search"
                        value={search}
                        onChange={(event) => updateFilter(setSearch)(event.target.value)}
                        placeholder="Search goal title, county, or entity"
                      />
                    </label>
                    <label>
                      County
                      <select value={county} onChange={(event) => updateFilter(setCounty)(event.target.value)}>
                        <option value="all">All counties</option>
                        {counties.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                    <label>
                      Sort by
                      <select value={sortKey} onChange={(event) => updateFilter(setSortKey)(event.target.value)}>
                        {GOAL_SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label>
                      Direction
                      <select value={sortDirection} onChange={(event) => updateFilter(setSortDirection)(event.target.value)}>
                        <option value="desc">Descending</option>
                        <option value="asc">Ascending</option>
                      </select>
                    </label>
                    <label>
                      Per page
                      <select value={pageSize} onChange={(event) => handlePageSizeChange(Number(event.target.value))}>
                        {PAGE_SIZE_CHOICES.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                      </select>
                    </label>
                  </div>

                  {pageRows.length === 0 ? (
                    <div className="archive-empty"><p>No investigative goals match the current filters.</p></div>
                  ) : (
                    <div className="archive-table__scroll">
                      <table className="archive-table">
                        <thead>
                          <tr>
                            <th>Goal title</th>
                            <th>County</th>
                            <th>Government entity</th>
                            <th>Tier</th>
                            <th>State</th>
                            <th>Records and Sources</th>
                            <th>Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((row) => (
                            <tr
                              key={row.goal_id}
                              tabIndex={0}
                              role="link"
                              aria-label={`Open ${row.title}`}
                              className="archive-table__row"
                              onClick={() => navigate(`/archive/goals/${row.goal_id}`)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  navigate(`/archive/goals/${row.goal_id}`);
                                }
                              }}
                            >
                              <td>{row.title}</td>
                              <td>{row.county}</td>
                              <td>{row.government_entity}</td>
                              <td>{row.tier ?? "—"}</td>
                              <td>
                                <span className={`archive-table__badge archive-table__badge--${row.completion_state.toLowerCase()}`}>
                                  {row.completion_state}
                                </span>
                              </td>
                              <td>{row.resource_count}</td>
                              <td>{row.updated_at ? new Date(row.updated_at).toLocaleDateString() : "Not recorded"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {totalPages > 1 && (
                    <div className="archive-pagination">
                      <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
                      <span>Page {currentPage} of {totalPages}</span>
                      <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <TemplatesTable navigate={navigate} />
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function TemplatesTable({ navigate }) {
  if (BLANK_REQUEST_TEMPLATES.length === 0) {
    return <div className="archive-empty"><p>No blank request forms are available yet.</p></div>;
  }

  return (
    <div className="archive-table__scroll">
      <table className="archive-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>County</th>
            <th>Government entity</th>
          </tr>
        </thead>
        <tbody>
          {BLANK_REQUEST_TEMPLATES.map((template) => (
            <tr
              key={template.slug}
              tabIndex={0}
              role="link"
              aria-label={`Open ${template.title}`}
              className="archive-table__row"
              onClick={() => navigate(`/documents/${template.slug}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate(`/documents/${template.slug}`);
                }
              }}
            >
              <td>{template.title}</td>
              <td>{template.county ?? "Not recorded"}</td>
              <td>{template.governmentEntity ?? "Not recorded"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

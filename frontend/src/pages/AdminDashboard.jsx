import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AdminDashboard.css";
import "./AdminPrint.css";
import { API_URL } from "../config/api";
import AdminNav from "../components/AdminNav";
import { AdminPagination, AdminSkeleton, useDebouncedValue } from "../components/AdminListParts";

const apiUrl = API_URL;
const PAGE_SIZE = 20;

const PROJECT_THEMES = [
  "OPEN INNOVATION",
  "BLOCKCHAIN & CYBERSECURITY",
  "HEALTHCARE",
  "AI & MACHINE LEARNING",
  "SUSTAINABILITY DEVELOPMENT",
  "FINTECH & EDTECH",
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [paging, setPaging] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [colleges, setColleges] = useState([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [themeFilter, setThemeFilter] = useState("all");
  const [emailStatusFilter, setEmailStatusFilter] = useState("all");
  const [loadingRows, setLoadingRows] = useState(true);
  const [printRows, setPrintRows] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const token = localStorage.getItem("dexathon_admin_token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const logout = useCallback(() => {
    localStorage.removeItem("dexathon_admin_token");
    localStorage.removeItem("dexathon_admin_profile");
    navigate("/admin/login");
  }, [navigate]);
  const handleError = useCallback((requestError, text) => {
    if (requestError.response?.status === 401) logout();
    else setError(text);
  }, [logout]);

  useEffect(() => {
    axios
      .get(`${apiUrl}/admin/dashboard`, { headers })
      .then((response) => setStats(response.data))
      .catch((requestError) => handleError(requestError, "Unable to load dashboard summary."));
    axios
      .get(`${apiUrl}/admin/colleges`, { headers })
      .then((response) => setColleges(response.data.colleges || []))
      .catch(() => {});
  }, [headers, handleError]);

  const filters = useMemo(
    () => ({
      college: collegeFilter,
      theme: themeFilter,
      emailStatus: emailStatusFilter,
      search: debouncedSearch,
    }),
    [collegeFilter, themeFilter, emailStatusFilter, debouncedSearch]
  );

  const loadRows = useCallback(() => {
    setLoadingRows(true);
    axios
      .get(`${apiUrl}/admin/registrations`, { headers, params: { ...filters, page, limit: PAGE_SIZE } })
      .then((response) => {
        setRows(response.data.items || []);
        setPaging({ page: response.data.page, pages: response.data.pages, total: response.data.total });
        setError("");
      })
      .catch((requestError) => handleError(requestError, "Unable to load registrations."))
      .finally(() => setLoadingRows(false));
  }, [headers, filters, page, handleError]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);
  useEffect(() => {
    setPage(1);
  }, [filters]);

  const printAll = async () => {
    setPrinting(true);
    try {
      const response = await axios.get(`${apiUrl}/admin/registrations`, {
        headers,
        params: { ...filters, all: 1, includeLogos: 1 },
      });
      setPrintRows(response.data.items || []);
    } catch (requestError) {
      handleError(requestError, "Unable to prepare the print view.");
      setPrinting(false);
    }
  };

  useEffect(() => {
    if (!printing || !printRows) return;
    window.print();
    setPrinting(false);
  }, [printing, printRows]);

  const STAT_CARDS = [
    { label: "Total Teams", value: stats?.totalTeams ?? "—" },
    { label: "Total Participants", value: stats?.totalParticipants ?? "—" },
    { label: "Colleges Represented", value: stats?.totalColleges ?? "—" },
    { label: "Project Themes", value: stats?.totalThemes ?? "—" },
    { label: "Confirmation Emails Sent", value: stats?.emailsSent ?? "—" },
    { label: "Round 1 PDF Submissions", value: stats?.pdfSubmitted ?? "—" },
    { label: "Round 1 Selected Teams", value: stats?.round1Selected ?? "—" },
    { label: "Faculty Mentors", value: stats?.facultyCount ?? "—" },
  ];

  return (
    <main className="admin-dashboard">
      <header>
        <div>
          <span style={{ fontSize: "11px", letterSpacing: "2px", color: "#ff7432", fontWeight: 800 }}>DEXATHON 2026</span>
          <h1 style={{ margin: "2px 0 0" }}>Admin Dashboard</h1>
        </div>
        <nav>
          <AdminNav />
        </nav>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => navigate("/admin/team-lists")}
            style={{
              background: "linear-gradient(135deg, #ff5a1f, #ff7432)",
              color: "#ffffff",
              border: 0,
              padding: "9px 16px",
              borderRadius: "6px",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Upload Spreadsheet
          </button>
          <button onClick={printAll} disabled={printing}>
            {printing ? "Preparing..." : "Print A4 List"}
          </button>
        </div>
      </header>

      {error && (
        <p className="admin-error">
          {error}{" "}
          <button type="button" onClick={loadRows}>
            Retry
          </button>
        </p>
      )}

      {stats ? (
        <section className="admin-stats">
          {STAT_CARDS.map((item) => (
            <div key={item.label}>
              <small>{item.label}</small>
              <b>{item.value}</b>
            </div>
          ))}
        </section>
      ) : (
        <AdminSkeleton rows={8} variant="cards" />
      )}

      <section className="admin-filter-bar">
        <div className="admin-filter-title">
          <b>Team & Registration Filters</b>
          <span>Search and filter imported teams across colleges and problem statements</span>
        </div>
        <div className="admin-filter-controls">
          <label>
            College
            <select value={collegeFilter} onChange={(event) => setCollegeFilter(event.target.value)}>
              <option value="all">All Colleges</option>
              <option value="sathyabama">Sathyabama Institute of Science and Technology</option>
              <option value="other">Other Colleges</option>
              {colleges
                .filter((c) => c && c.toLowerCase() !== "sathyabama institute of science and technology")
                .map((college) => (
                  <option key={college} value={college}>
                    {college}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Project Theme
            <select value={themeFilter} onChange={(event) => setThemeFilter(event.target.value)}>
              <option value="all">All Themes</option>
              {PROJECT_THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-filter-search">
            Search
            <input
              className="admin-search"
              placeholder="Search Team / Leader / Email / ID / College"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="admin-status-filters">
          {[
            ["all", "All Teams"],
            ["sent", "Email Sent ✓"],
            ["not-sent", "Email Not Sent"],
            ["failed", "Email Failed ⚠"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={emailStatusFilter === value ? "active" : ""}
              onClick={() => setEmailStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {loadingRows && !rows.length ? (
        <AdminSkeleton rows={6} />
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0" }}>
            <p className="admin-result-count" style={{ margin: 0 }}>
              Showing {paging.total} registered teams
            </p>
            <Link
              to="/admin/team-lists"
              style={{
                fontSize: "12px",
                color: "#ff7432",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Manage & Import in Team Lists →
            </Link>
          </div>
          <div className="admin-table-wrap" style={loadingRows ? { opacity: 0.6 } : undefined}>
            <table>
              <thead>
                <tr>
                  <th>Team ID</th>
                  <th>Team Name</th>
                  <th>Team Head</th>
                  <th>Members</th>
                  <th>College & Dept</th>
                  <th>Faculty Mentor</th>
                  <th>Registration Email</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "30px", color: "#8fa4bd" }}>
                      No teams match the current filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row._id}>
                      <td>
                        <span style={{ fontFamily: "monospace", color: "#55caff", fontWeight: 700 }}>{row.teamId}</span>
                        <br />
                        <small style={{ color: "#8fa4bd" }}>{row.registrationNumber}</small>
                      </td>
                      <td>
                        <b>{row.teamName}</b>
                        {row.projectTheme ? <small className="admin-theme-tag">{row.projectTheme}</small> : null}
                      </td>
                      <td>
                        <strong>{row.leader?.name || "—"}</strong>
                        <br />
                        <small style={{ color: "#cad6e3" }}>{row.leader?.email}</small>
                        {row.leader?.phone ? (
                          <>
                            <br />
                            <small style={{ color: "#8fa4bd" }}>{row.leader?.phone}</small>
                          </>
                        ) : null}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: "#ffb27a" }}>
                          {(row.members || []).length} Members
                        </span>
                        <br />
                        <small style={{ color: "#aebfd1" }}>
                          {(row.members || []).map((m) => m.name).filter(Boolean).join(", ") || "—"}
                        </small>
                      </td>
                      <td>
                        {row.college}
                        {row.department ? (
                          <>
                            <br />
                            <small style={{ color: "#8fa4bd" }}>{row.department}</small>
                          </>
                        ) : null}
                      </td>
                      <td>{row.mentor?.name || "—"}</td>
                      <td>
                        {row.registrationEmail?.status === "Sent" ? (
                          <span style={{ color: "#4ade80", fontWeight: 700, fontSize: "11px" }}>✓ SENT</span>
                        ) : row.registrationEmail?.status === "Failed" ? (
                          <span style={{ color: "#f87171", fontWeight: 700, fontSize: "11px" }}>⚠ FAILED</span>
                        ) : row.registrationEmail?.status === "Sending" ? (
                          <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: "11px" }}>SENDING…</span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "11px" }}>Not Sent</span>
                        )}
                      </td>
                      <td>
                        <Link
                          to="/admin/team-lists"
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            background: "#0b1628",
                            border: "1px solid #55caff44",
                            borderRadius: "4px",
                            color: "#55caff",
                            fontSize: "11px",
                            textDecoration: "none",
                            fontWeight: 700,
                          }}
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={paging.page}
            pages={paging.pages}
            total={paging.total}
            limit={PAGE_SIZE}
            onChange={setPage}
            label="teams"
          />
        </>
      )}

      <section className="print-registration-list">
        <header className="print-list-header">
          <strong>DEXATHON 2026</strong>
          <span>OFFICIAL TEAM REGISTRATION LIST</span>
        </header>
        {(printRows || []).map((row) => (
          <article className="team-print-card" key={`print-${row._id}`}>
            <div className="team-print-top">
              <div>
                <h2>{row.teamName}</h2>
                <p>
                  <b>Team Head:</b> {row.leader?.name} ({row.leader?.email})
                </p>
                {row.projectTheme ? (
                  <p>
                    <b>Project Theme:</b> {row.projectTheme}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="team-print-members">
              <b>Registered Members ({(row.members || []).length}):</b>
              <ol>
                {(row.members || []).map((member, index) => (
                  <li key={`${row._id}-${member.studentId || member.email || index}`}>{member.name}</li>
                ))}
              </ol>
            </div>
            <div className="team-print-meta">
              <span>
                <b>Team ID:</b> {row.teamId}
              </span>
              <span>
                <b>Registration No:</b> {row.registrationNumber}
              </span>
              <span>
                <b>College:</b> {row.college}
              </span>
              <span>
                <b>Department:</b> {row.department || "—"}
              </span>
              <span>
                <b>Year:</b> {row.year || "—"}
              </span>
              <span>
                <b>Faculty Mentor:</b> {row.mentor?.name || "—"}
              </span>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

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

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [paging, setPaging] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [colleges, setColleges] = useState([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loadingRows, setLoadingRows] = useState(true);
  const [printRows, setPrintRows] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const token = localStorage.getItem("dexathon_admin_token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const logout = useCallback(() => { localStorage.removeItem("dexathon_admin_token"); localStorage.removeItem("dexathon_admin_profile"); navigate("/admin/login"); }, [navigate]);
  const handleError = useCallback((requestError, text) => { if (requestError.response?.status === 401) logout(); else setError(text); }, [logout]);

  // Critical summary first (a single aggregation), college list in parallel; the table loads on its own.
  useEffect(() => {
    axios.get(`${apiUrl}/admin/dashboard`, { headers }).then((response) => setStats(response.data)).catch((requestError) => handleError(requestError, "Unable to load the dashboard summary."));
    axios.get(`${apiUrl}/admin/colleges`, { headers }).then((response) => setColleges(response.data.colleges)).catch(() => {});
  }, [headers, handleError]);

  const filters = useMemo(() => ({ college: collegeFilter, status: statusFilter, search: debouncedSearch }), [collegeFilter, statusFilter, debouncedSearch]);

  const loadRows = useCallback(() => {
    setLoadingRows(true);
    axios.get(`${apiUrl}/admin/registrations`, { headers, params: { ...filters, page, limit: PAGE_SIZE } })
      .then((response) => { setRows(response.data.items); setPaging({ page: response.data.page, pages: response.data.pages, total: response.data.total }); setError(""); })
      .catch((requestError) => handleError(requestError, "Unable to load registrations."))
      .finally(() => setLoadingRows(false));
  }, [headers, filters, page, handleError]);

  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { setPage(1); }, [filters]);

  // Print A4 needs every matching team with its logo, so it is fetched only when printing.
  const printAll = async () => {
    setPrinting(true);
    try {
      const response = await axios.get(`${apiUrl}/admin/registrations`, { headers, params: { ...filters, all: 1, includeLogos: 1 } });
      setPrintRows(response.data.items);
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

  return <main className="admin-dashboard">
    <header><h1>DEXATHON 2026 Admin</h1><nav><AdminNav /></nav><button onClick={printAll} disabled={printing}>{printing ? "Preparing..." : "Print A4"}</button></header>
    {error && <p className="admin-error">{error} <button type="button" onClick={loadRows}>Retry</button></p>}
    {stats ? <section className="admin-stats">{Object.entries(stats).map(([key, value]) => <div key={key}><small>{key.replace(/([A-Z])/g, " $1")}</small><b>{key === "totalAmount" ? `₹${value}` : value}</b></div>)}</section>
      : <AdminSkeleton rows={4} variant="cards" />}
    <section className="admin-filter-bar">
      <div className="admin-filter-title"><b>Filters</b><span>Filter registration and payment records</span></div>
      <div className="admin-filter-controls">
        <label>College<select value={collegeFilter} onChange={(event) => setCollegeFilter(event.target.value)}><option value="all">All Colleges</option><option value="sathyabama">Sathyabama Institute of Science and Technology</option><option value="other">Other Colleges</option>{colleges.filter((college) => college.toLowerCase() !== "sathyabama institute of science and technology").map((college) => <option key={college} value={college}>{college}</option>)}</select></label>
        <label>Payment Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All Status</option><option value="success">Success</option><option value="failed">Failed</option><option value="pending">Pending</option></select></label>
        <label className="admin-filter-search">Search<input className="admin-search" placeholder="Search Team / Team Head / College / Transaction ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      <div className="admin-status-filters">{[["all", "All"], ["success", "Success"], ["failed", "Failed"], ["pending", "Pending"]].map(([value, label]) => <button type="button" key={value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{label}</button>)}</div>
    </section>
    {loadingRows && !rows.length ? <AdminSkeleton rows={6} /> : <>
      <p className="admin-result-count">Showing {paging.total} registrations</p>
      <div className="admin-table-wrap" style={loadingRows ? { opacity: 0.6 } : undefined}><table><thead><tr><th>Team ID</th><th>Team</th><th>Team Leader</th><th>Members</th><th>College</th><th>Faculty</th><th>Payment</th><th>Transaction</th></tr></thead><tbody>{rows.map((row) => <tr key={row._id}><td>{row.teamId}</td><td>{row.teamName}</td><td>{row.leader?.name}</td><td>{(row.members || []).map((member) => member.name).join(", ")}</td><td>{row.college}<br /><small>{row.department}</small></td><td>{row.mentor?.name || "—"}</td><td>₹{row.payment?.amount}<br /><small>{row.payment?.status}</small></td><td>{row.payment?.transactionId || "—"}</td></tr>)}</tbody></table></div>
      <AdminPagination page={paging.page} pages={paging.pages} total={paging.total} limit={PAGE_SIZE} onChange={setPage} label="registrations" />
    </>}
    <section className="print-registration-list">
      <header className="print-list-header"><strong>DEXATHON 2026</strong><span>TEAM REGISTRATION LIST</span></header>
      {(printRows || []).map((row) => <article className="team-print-card" key={`print-${row._id}`}>
        <div className="team-print-top"><div className="team-print-logo">{row.teamLogo ? <img src={row.teamLogo} alt="Team logo" /> : <span>LOGO</span>}</div><div><h2>{row.teamName}</h2><p><b>Team Head:</b> {row.leader?.name}</p></div></div>
        <div className="team-print-members"><b>Members:</b><ol>{(row.members || []).map((member, index) => <li key={`${row._id}-${member.studentId || member.email || index}`}>{member.name}</li>)}</ol></div>
        <div className="team-print-meta"><span><b>Team ID:</b> {row.teamId}</span><span><b>Registration No:</b> {row.registrationNumber}</span><span><b>College:</b> {row.college}</span><span><b>Department:</b> {row.department}</span><span><b>Year:</b> {row.year}</span><span><b>Payment:</b> {row.payment?.status}</span><span><b>Transaction ID:</b> {row.payment?.transactionId || "—"}</span></div>
      </article>)}
    </section>
  </main>;
}

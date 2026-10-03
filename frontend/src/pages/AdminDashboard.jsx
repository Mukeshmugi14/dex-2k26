import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AdminDashboard.css";
import "./AdminPrint.css";
import { API_URL } from "../config/api";

const apiUrl = API_URL;

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const token = localStorage.getItem("dexathon_admin_token");
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    Promise.all([axios.get(`${apiUrl}/admin/dashboard`, { headers }), axios.get(`${apiUrl}/admin/registrations`, { headers })])
      .then(([dashboard, registrations]) => { setStats(dashboard.data); setRows(registrations.data); })
      .catch(() => setError("Unable to load the dashboard."));
  }, []);

  const colleges = useMemo(() => [...new Set(rows.map((row) => row.college).filter(Boolean))].sort(), [rows]);
  const visibleRows = useMemo(() => rows.filter((row) => {
    const college = row.college?.trim().toLowerCase();
    const isSathyabama = college === "sathyabama institute of science and technology";
    const paymentStatus = row.payment?.status?.toLowerCase();
    const status = paymentStatus === "successful" ? "success" : paymentStatus === "failed" ? "failed" : "pending";
    const searchValue = search.trim().toLowerCase();
    const matchesCollege = collegeFilter === "all" || (collegeFilter === "sathyabama" ? isSathyabama : collegeFilter === "other" ? !isSathyabama : row.college === collegeFilter);
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    const matchesSearch = !searchValue || [row.teamName, row.teamId, row.leader?.name, row.leader?.email, row.college, row.payment?.transactionId].some((value) => value?.toLowerCase().includes(searchValue));
    return matchesCollege && matchesStatus && matchesSearch;
  }), [rows, collegeFilter, statusFilter, search]);
  const logout = () => { localStorage.removeItem("dexathon_admin_token"); navigate("/admin/login"); };

  return <main className="admin-dashboard">
    <header><h1>DEXATHON 2026 Admin</h1><nav><Link to="/admin/dashboard">Dashboard</Link><Link to="/admin/payment-history">Payment History</Link><Link to="/admin/teams">Teams</Link><Link to="/admin/pdf-submissions">PDF Submissions</Link><Link to="/admin/rounds">Round Status</Link><Link to="/admin/round-selection">Round Selection</Link><Link to="/admin/payment-settings">Payment Settings</Link><button onClick={logout}>Logout</button></nav><button onClick={() => window.print()}>Print A4</button></header>
    {error && <p className="admin-error">{error}</p>}
    <section className="admin-stats">{Object.entries(stats).map(([key, value]) => <div key={key}><small>{key.replace(/([A-Z])/g, " $1")}</small><b>{key === "totalAmount" ? `₹${value}` : value}</b></div>)}</section>
    <section className="admin-filter-bar">
      <div className="admin-filter-title"><b>Filters</b><span>Filter registration and payment records</span></div>
      <div className="admin-filter-controls">
        <label>College<select value={collegeFilter} onChange={(event) => setCollegeFilter(event.target.value)}><option value="all">All Colleges</option><option value="sathyabama">Sathyabama Institute of Science and Technology</option><option value="other">Other Colleges</option>{colleges.filter((college) => college.toLowerCase() !== "sathyabama institute of science and technology").map((college) => <option key={college} value={college}>{college}</option>)}</select></label>
        <label>Payment Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All Status</option><option value="success">Success</option><option value="failed">Failed</option><option value="pending">Pending</option></select></label>
        <label className="admin-filter-search">Search<input className="admin-search" placeholder="Search Team / Team Head / College / Transaction ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      <div className="admin-status-filters">{[["all", "All"], ["success", "Success"], ["failed", "Failed"], ["pending", "Pending"]].map(([value, label]) => <button type="button" key={value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{label}</button>)}</div>
    </section>
    <p className="admin-result-count">Showing {visibleRows.length} registrations</p>
    <div className="admin-table-wrap"><table><thead><tr><th>Team ID</th><th>Team</th><th>Team Leader</th><th>Members</th><th>College</th><th>Faculty</th><th>Payment</th><th>Transaction</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row._id}><td>{row.teamId}</td><td>{row.teamName}</td><td>{row.leader.name}</td><td>{row.members.map((member) => member.name).join(", ")}</td><td>{row.college}<br /><small>{row.department}</small></td><td>{row.mentor?.name || "—"}</td><td>₹{row.payment.amount}<br /><small>{row.payment.status}</small></td><td>{row.payment.transactionId || "—"}</td></tr>)}</tbody></table></div>
    <section className="print-registration-list">
      <header className="print-list-header"><strong>DEXATHON 2026</strong><span>TEAM REGISTRATION LIST</span></header>
      {visibleRows.map((row) => <article className="team-print-card" key={`print-${row._id}`}>
        <div className="team-print-top"><div className="team-print-logo">{row.teamLogo ? <img src={row.teamLogo} alt="Team logo" /> : <span>LOGO</span>}</div><div><h2>{row.teamName}</h2><p><b>Team Head:</b> {row.leader.name}</p></div></div>
        <div className="team-print-members"><b>Members:</b><ol>{row.members.map((member) => <li key={`${row._id}-${member.studentId || member.email}`}>{member.name}</li>)}</ol></div>
        <div className="team-print-meta"><span><b>Team ID:</b> {row.teamId}</span><span><b>Registration No:</b> {row.registrationNumber}</span><span><b>College:</b> {row.college}</span><span><b>Department:</b> {row.department}</span><span><b>Year:</b> {row.year}</span><span><b>Payment:</b> {row.payment.status}</span><span><b>Transaction ID:</b> {row.payment.transactionId || "—"}</span></div>
      </article>)}
    </section>
  </main>;
}

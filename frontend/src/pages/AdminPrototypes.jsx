import axios from "axios";
import { Cpu, ExternalLink, Monitor, PlayCircle, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminDashboard.css";
import "./AdminPrototypes.css";
import { API_URL } from "../config/api";
import { clearAdminSession, getAdminToken } from "../config/adminSession";
import useAutoRefresh from "../config/useAutoRefresh";
import AdminNav from "../components/AdminNav";

const SERVER_DOWN = "Can't reach the backend server. Start it in a terminal with: npm --prefix backend run dev — then try again.";
const fmtTime = (value) => (value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "");
const CATEGORY = {
  SOFTWARE: { label: "Software", note: "Website / app link", Icon: Monitor, action: "Open website" },
  HARDWARE: { label: "Hardware", note: "YouTube demo video", Icon: Cpu, action: "Watch on YouTube" },
};
const FILTERS = [["all", "All teams"], ["submitted", "Submitted"], ["SOFTWARE", "Software"], ["HARDWARE", "Hardware"], ["pending", "Not submitted"]];

// Admin → Prototypes: each team's Round 2 submission, its category and a button to open it.
export default function AdminPrototypes() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("submitted");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const token = getAdminToken();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const load = useCallback(({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    axios.get(`${API_URL}/admin/prototypes`, { headers })
      .then((response) => { setData(response.data); setError(""); })
      .catch((requestError) => {
        if (requestError.response?.status === 401) { clearAdminSession(); navigate("/devleader/login"); return; }
        if (!silent) setError(!requestError.response ? SERVER_DOWN : requestError.response.data?.message || "Unable to load prototypes.");
      })
      .finally(() => { if (!silent) setRefreshing(false); });
  }, [headers, navigate]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.teams || []).filter((t) => {
      if (filter === "submitted" && !t.submitted) return false;
      if ((filter === "SOFTWARE" || filter === "HARDWARE") && t.category !== filter) return false;
      if (filter === "pending" && (t.submitted || !t.eligible)) return false;
      return !term || [t.teamId, t.teamName, t.teamHead, t.email, t.college, t.host].some((v) => String(v).toLowerCase().includes(term));
    });
  }, [data, filter, search]);

  const c = data?.counts;
  const countFor = { all: c?.teams, submitted: c?.submitted, SOFTWARE: c?.software, HARDWARE: c?.hardware, pending: c?.notSubmitted };

  return <main className="admin-dashboard admin-prototypes">
    <header>
      <h1>Round 2 Prototypes</h1>
      <nav><AdminNav /></nav>
    </header>

    {c ? <section className="proto-summary" aria-label="Prototype submissions">
      <div><small>Submitted</small><b>{c.submitted}</b><span>of {c.teams} teams</span></div>
      <div><small><Monitor size={13} /> Software</small><b>{c.software}</b><span>website / app links</span></div>
      <div><small><Cpu size={13} /> Hardware</small><b>{c.hardware}</b><span>YouTube demo videos</span></div>
      <div><small>Not submitted yet</small><b>{c.notSubmitted}</b><span>closes {fmtTime(data.deadline)}</span></div>
    </section> : null}

    <div className="proto-controls">
      <div className="proto-filters" role="tablist" aria-label="Filter">
        {FILTERS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}{countFor[key] !== undefined ? ` (${countFor[key]})` : ""}</button>)}
      </div>
      <label className="proto-search"><Search size={14} aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team, Team Head, college or link" aria-label="Search" /></label>
      <button type="button" className="proto-refresh" onClick={() => load()} disabled={refreshing}><RefreshCw size={14} /> Refresh</button>
    </div>
    {error ? <p className="admin-error">{error}</p> : null}

    {data ? (visible.length ? <ul className="proto-list">
      {visible.map((t) => {
        const cat = CATEGORY[t.category];
        return <li key={t.id} className={`proto-card ${t.submitted ? "" : "is-empty"}`}>
          {t.videoId ? <a className="proto-thumb" href={t.url} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${t.teamName}'s video on YouTube`}>
            <img src={`https://i.ytimg.com/vi/${t.videoId}/mqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" /><PlayCircle size={34} aria-hidden="true" />
          </a> : null}
          <div className="proto-body">
            <div className="proto-head">
              <b>{t.teamId}</b><h2>{t.teamName}</h2>
              {cat ? <span className={`proto-badge is-${t.category.toLowerCase()}`}><cat.Icon size={13} aria-hidden="true" /> {cat.label}</span> : <span className="proto-badge is-none">{t.eligible ? "Not submitted" : "Not in Round 2"}</span>}
            </div>
            <p className="proto-meta">{t.teamHead || "—"} · {t.email}{t.college ? ` · ${t.college}` : ""}</p>
            {t.submitted ? <>
              <p className="proto-link"><span>{cat?.note}:</span> <a href={t.url} target="_blank" rel="noopener noreferrer">{t.url}</a></p>
              <div className="proto-actions">
                <a className="proto-open" href={t.url} target="_blank" rel="noopener noreferrer">{t.category === "HARDWARE" ? <PlayCircle size={15} /> : <ExternalLink size={15} />} {cat?.action || "Open link"}</a>
                <small>Submitted {fmtTime(t.submittedAt)} · {t.host}</small>
              </div>
            </> : null}
          </div>
        </li>;
      })}
    </ul> : <p className="proto-empty">No teams match this filter.</p>) : !error ? <p className="proto-empty">Loading prototypes…</p> : null}
  </main>;
}

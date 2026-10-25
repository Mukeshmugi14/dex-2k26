import axios from "axios";
import { Download, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AdminTeams.css";
import "./AdminShortlist.css";
import { API_URL } from "../config/api";
import AdminNav from "../components/AdminNav";
import { AdminSkeleton } from "../components/AdminListParts";
import { clearAdminSession, getAdminToken } from "../config/adminSession";
import useAutoRefresh from "../config/useAutoRefresh";

const DECISION = { PENDING: "Pending", SELECTED: "Selected", REJECTED: "Not selected" };
const csvCell = (value) => { const s = String(value ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Round 1 shortlist: teams ranked by final score (average of their 3 evaluators' sheets, out of 100).
// This page previews a cut-off; the decisions and result emails stay on the Round Selection page.
export default function AdminShortlist() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("top");
  const [topN, setTopN] = useState(50);
  const [minScore, setMinScore] = useState(60);
  const [finalOnly, setFinalOnly] = useState(true);
  const [theme, setTheme] = useState("All");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const token = getAdminToken();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const load = useCallback(({ silent = false } = {}) => {
    if (!silent) setError("");
    axios.get(`${API_URL}/admin/shortlist`, { headers })
      .then((r) => setData(r.data))
      .catch((e) => { if (e.response?.status === 401) { clearAdminSession(); navigate("/devleader/login"); } else if (!silent) setError(e.response?.data?.message || "Unable to load the shortlist."); });
  }, [headers, navigate]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const teams = useMemo(() => data?.teams || [], [data]);
  const themes = useMemo(() => ["All", ...new Set(teams.map((t) => t.theme).filter(Boolean))], [teams]);
  const pool = useMemo(() => teams.filter((t) => t.score !== null && (!finalOnly || t.complete) && (theme === "All" || t.theme === theme)), [teams, finalOnly, theme]);
  // Shortlist preview over the ranked pool: top N (ties at the cut are included) or everyone at/above a score.
  const shortlisted = useMemo(() => {
    if (mode === "min") return new Set(pool.filter((t) => t.score >= Number(minScore)).map((t) => t.id));
    const n = Math.max(0, Number.parseInt(topN, 10) || 0);
    const cut = pool[n - 1]?.score;
    return new Set(n ? pool.filter((t, i) => i < n || t.score === cut).map((t) => t.id) : []);
  }, [pool, mode, topN, minScore]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = teams.filter((t) => (theme === "All" || t.theme === theme) && (!finalOnly || t.complete || t.score === null));
    return term ? base.filter((t) => [t.teamId, t.teamName, t.college, t.teamHead].some((v) => String(v || "").toLowerCase().includes(term))) : base;
  }, [teams, theme, finalOnly, search]);
  const cutIndex = shown.findIndex((t, i) => shortlisted.has(t.id) && !shortlisted.has(shown[i + 1]?.id));

  const stats = data ? {
    total: teams.length,
    final: teams.filter((t) => t.complete).length,
    provisional: teams.filter((t) => t.score !== null && !t.complete).length,
    none: teams.filter((t) => t.score === null).length,
    disagree: teams.filter((t) => t.disagreement).length,
    flagged: teams.filter((t) => t.policyFlags.length).length,
  } : null;

  const exportCsv = () => {
    const head = ["Rank", "Team ID", "Team", "Team Head", "College", "Theme", "Final score", "Sheets", "Final?", "Evaluator totals", "Spread", "Recommendations", "Policy flags", "Shortlist preview", "Round 1 decision"];
    const lines = teams.map((t) => [t.rank ?? "", t.teamId, t.teamName, t.teamHead, t.college, t.theme, t.score ?? "", `${t.count}/${t.panelSize}`, t.complete ? "Yes" : "No", t.scores.join(" | "), t.spread ?? "",
      Object.entries(t.recommendations).map(([k, v]) => `${k} ×${v}`).join(" | "), t.policyFlags.join(" | "), shortlisted.has(t.id) ? "Yes" : "", DECISION[t.round1] || t.round1].map(csvCell).join(","));
    const url = URL.createObjectURL(new Blob([`\uFEFF${[head.join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `dexathon-round1-shortlist-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setMessage(`Exported ${teams.length} teams (${shortlisted.size} in the shortlist preview).`);
  };

  return <main className="admin-teams admin-shortlist">
    <header className="admin-teams-header">
      <div><p>DEXATHON 2026 ADMIN</p><h1>Round 1 Shortlist</h1><span>Ranked by final score: the average of each PPT's {data?.panelSize || 3} evaluator sheets (out of 100). Make the decisions on <Link to="/devleader/round-selection" style={{ color: "#55caff" }}>Round Selection</Link>.</span></div>
      <nav><AdminNav /></nav>
    </header>
    {message ? <p className="admin-teams-message" role="status">{message}<button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={14} /></button></p> : null}
    {error ? <div className="admin-teams-state error"><p>{error}</p><button type="button" onClick={() => load()}>Retry</button></div> : null}
    {!data && !error ? <AdminSkeleton rows={6} /> : null}

    {data ? <>
      <section className="sl-stats" aria-label="Scoring progress">
        <div><span>PPTs</span><b>{stats.total}</b></div>
        <div><span>Final scores ({data.panelSize}/{data.panelSize})</span><b>{stats.final}</b></div>
        <div><span>Provisional</span><b>{stats.provisional}</b></div>
        <div><span>No score yet</span><b>{stats.none}</b></div>
        <div className={stats.disagree ? "is-warn" : ""}><span>Panel disagreement (&gt;{data.spreadAlert})</span><b>{stats.disagree}</b></div>
        <div className={stats.flagged ? "is-warn" : ""}><span>Policy flags</span><b>{stats.flagged}</b></div>
      </section>

      {data.evaluators?.length ? <section className="sl-progress" aria-label="Evaluator progress">
        <h2>Evaluator progress</h2>
        <div className="sl-progress-grid">{data.evaluators.map((e) => {
          const pct = e.assigned ? Math.round((e.submitted / e.assigned) * 100) : 0;
          return <article key={e.id} className={e.active ? "" : "is-off"}>
            <header><b>{e.name}</b><span>{e.active ? `${pct}%` : "Disabled"}</span></header>
            <i className="sl-bar" style={{ "--p": e.assigned ? e.submitted / e.assigned : 0 }} />
            <dl>
              <div><dt>Submitted</dt><dd>{e.submitted} / {e.assigned}</dd></div>
              <div><dt>Left</dt><dd>{e.left}</dd></div>
              <div><dt>Drafts</dt><dd>{e.drafts}</dd></div>
              <div><dt>Avg given</dt><dd>{e.averageTotal ?? "–"}</dd></div>
            </dl>
            <small>{e.lastSubmittedAt ? `Last submitted ${new Date(e.lastSubmittedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}` : "No sheet submitted yet"}{e.lastLoginAt ? ` · last sign-in ${new Date(e.lastLoginAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}` : " · never signed in"}</small>
          </article>;
        })}</div>
      </section> : null}

      <section className="sl-controls">
        <div className="sl-mode" role="radiogroup" aria-label="Cut-off">
          <label className={mode === "top" ? "is-on" : ""}><input type="radio" checked={mode === "top"} onChange={() => setMode("top")} /> Top</label>
          <input type="number" min="0" value={topN} onChange={(e) => setTopN(e.target.value)} disabled={mode !== "top"} aria-label="Number of teams" />
          <label className={mode === "min" ? "is-on" : ""}><input type="radio" checked={mode === "min"} onChange={() => setMode("min")} /> Score ≥</label>
          <input type="number" min="0" max="100" step="0.1" value={minScore} onChange={(e) => setMinScore(e.target.value)} disabled={mode !== "min"} aria-label="Minimum score" />
        </div>
        <label className="sl-check"><input type="checkbox" checked={finalOnly} onChange={(e) => setFinalOnly(e.target.checked)} /> Final scores only ({data.panelSize}/{data.panelSize})</label>
        <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme">{themes.map((t) => <option key={t} value={t}>{t === "All" ? "All themes" : t}</option>)}</select>
        <input className="sl-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team / college / head" aria-label="Search" />
        <button type="button" className="ghost" onClick={() => load()}><RefreshCw size={14} /> Refresh</button>
        <button type="button" onClick={exportCsv}><Download size={14} /> Export CSV</button>
      </section>
      <p className="sl-summary"><b>{shortlisted.size}</b> team{shortlisted.size === 1 ? "" : "s"} in the shortlist preview{pool.length ? ` · cut-off score ${Math.min(...pool.filter((t) => shortlisted.has(t.id)).map((t) => t.score).concat([Infinity])) === Infinity ? "—" : Math.min(...pool.filter((t) => shortlisted.has(t.id)).map((t) => t.score))}` : ""} · ranking uses the total score only; recommendations are advisory.</p>

      <div className="sl-table-wrap"><table className="sl-table">
        <thead><tr><th>Rank</th><th>Team</th><th>College · Theme</th><th>Final</th><th>Sheets</th><th>Evaluator totals</th><th>Recommendations</th><th>Round 1</th></tr></thead>
        <tbody>{shown.map((t, i) => <tr key={t.id} className={`${shortlisted.has(t.id) ? "is-in" : ""} ${i === cutIndex ? "is-cut" : ""}`}>
          <td className="sl-rank">{t.rank ?? "—"}</td>
          <td><b>{t.teamName}</b><small>{t.teamId}{t.teamHead ? ` · ${t.teamHead}` : ""}{t.notCounted ? " · not counted" : ""}</small></td>
          <td><span>{t.college || "—"}</span><small>{t.theme || "—"}</small></td>
          <td className="sl-score">{t.score ?? "—"}{shortlisted.has(t.id) ? <em>shortlist</em> : null}</td>
          <td>{t.count}/{t.panelSize}{t.complete ? " ✓" : ""}{t.panel < t.panelSize ? <small className="sl-warn">panel {t.panel}/{t.panelSize}</small> : null}</td>
          <td>{t.scores.length ? t.scores.join(" · ") : "—"}{t.disagreement ? <small className="sl-warn">⚠ spread {t.spread}</small> : null}{t.policyFlags.length ? <small className="sl-warn">⚑ {t.policyFlags.join(", ")}</small> : null}</td>
          <td className="sl-recs">{Object.entries(t.recommendations).map(([k, v]) => <span key={k}>{k}{v > 1 ? ` ×${v}` : ""}</span>)}</td>
          <td className={`sl-dec is-${t.round1.toLowerCase()}`}>{DECISION[t.round1] || t.round1}</td>
        </tr>)}</tbody>
      </table></div>
    </> : null}
  </main>;
}

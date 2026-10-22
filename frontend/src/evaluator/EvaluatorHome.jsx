import axios from "axios";
import { BarChart3, CheckCircle2, ChevronRight, CircleDashed, Clock3, FileText, Lock, PencilLine, RefreshCw, Search, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL } from "../config/api";
import { clearEvaluatorSession, evaluatorHeaders } from "../config/evaluatorSession";

const STATUS = {
  "not-started": { label: "Not started", Icon: CircleDashed, tone: "todo" },
  draft: { label: "Draft saved", Icon: PencilLine, tone: "draft" },
  submitted: { label: "Submitted", Icon: CheckCircle2, tone: "done" },
};
const FILTERS = [["all", "All"], ["not-started", "Not started"], ["draft", "Drafts"], ["submitted", "Submitted"]];
const SORTS = [["todo", "To do first"], ["id", "Team ID"], ["score-high", "My score: high → low"], ["score-low", "My score: low → high"], ["recent", "Recently saved"]];
const ORDER = { draft: 0, "not-started": 1, submitted: 2 };
const fmtWhen = (value) => (value ? new Date(value).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");

function Insights({ data, teams, panelSize, resultsAt }) {
  const total = teams.length;
  const done = teams.filter((t) => t.myStatus === "submitted").length;
  const drafts = teams.filter((t) => t.myStatus === "draft").length;
  const left = total - done;
  const maxBucket = Math.max(1, ...data.distribution.map((b) => b.count));
  const scored = data.criteria.filter((c) => c.averageLevel !== null);
  return <section className="eval-insights" aria-label="Your progress and scoring">
    <div className="eval-stats">
      <div className="eval-stat is-main"><small>Your PPTs</small><b>{done}<em> / {total}</em></b><span>submitted</span><i style={{ "--p": total ? done / total : 0 }} /></div>
      <div className="eval-stat"><small>Left to score</small><b>{left}</b><span>{drafts ? `${drafts} draft${drafts === 1 ? "" : "s"} in progress` : "none in progress"}</span></div>
      <div className="eval-stat"><small>Your average</small><b>{data.averageTotal ?? "–"}<em>{data.averageTotal !== null ? " / 100" : ""}</em></b><span>{data.submitted ? `range ${data.lowest}–${data.highest}` : "after your first submission"}</span></div>
      <div className="eval-stat"><small><Clock3 size={12} /> Round 1 results</small><b className="is-text">{fmtWhen(resultsAt)}</b><span>Each PPT is scored by {panelSize} evaluators; the final score is their average.</span></div>
    </div>
    {data.submitted ? <div className="eval-insight-grid">
      <div className="eval-card-lite">
        <h3><BarChart3 size={15} /> Your score distribution</h3>
        <ul className="eval-hist">{data.distribution.map((b) => <li key={b.label}><span>{b.label}</span><i><s style={{ width: `${(b.count / maxBucket) * 100}%` }} /></i><b>{b.count}</b></li>)}</ul>
      </div>
      <div className="eval-card-lite">
        <h3>Your average level per criterion</h3>
        <ul className="eval-crit-avg">{scored.map((c) => <li key={c.id} title={c.name}><span>{c.id}</span><i><s style={{ width: `${(c.averageLevel / 5) * 100}%` }} /></i><b>{c.averageLevel}</b></li>)}</ul>
        <small className="eval-muted">Level 0–5. Use it to spot a criterion you score much higher or lower than the others.</small>
      </div>
      <div className="eval-card-lite">
        <h3>Your recommendations</h3>
        {data.recommendations.length ? <ul className="eval-recs">{data.recommendations.map((r) => <li key={r.label}><span>{r.label}</span><b>{r.count}</b></li>)}</ul> : <p className="eval-muted">None yet.</p>}
        {data.flagged ? <p className="eval-flag-note">{data.flagged} sheet{data.flagged === 1 ? "" : "s"} with a policy flag (organisers will review).</p> : null}
      </div>
    </div> : null}
  </section>;
}

export default function EvaluatorHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("todo");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError("");
    axios.get(`${API_URL}/evaluator/teams`, { headers: evaluatorHeaders() })
      .then((response) => setData(response.data))
      .catch((requestError) => {
        if (requestError.response?.status === 401) { clearEvaluatorSession(); navigate("/evaluator/login", { replace: true }); return; }
        setError(requestError.response?.data?.message || "Unable to load your PPTs. Check your connection and try again.");
      });
  }, [navigate]);
  useEffect(() => { load(); }, [load]);

  const teams = data?.teams || null;
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([key]) => [key, (teams || []).filter((t) => key === "all" || t.myStatus === key).length])), [teams]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (teams || []).filter((t) => (filter === "all" || t.myStatus === filter)
      && (!term || [t.teamId, t.teamName, t.college, t.theme, t.department].some((v) => String(v || "").toLowerCase().includes(term))));
    const by = {
      todo: (a, b) => ORDER[a.myStatus] - ORDER[b.myStatus] || a.teamId.localeCompare(b.teamId),
      id: (a, b) => a.teamId.localeCompare(b.teamId),
      "score-high": (a, b) => (b.myTotal ?? -1) - (a.myTotal ?? -1),
      "score-low": (a, b) => (a.myTotal ?? 101) - (b.myTotal ?? 101),
      recent: (a, b) => new Date(b.myUpdatedAt || 0) - new Date(a.myUpdatedAt || 0),
    }[sort];
    return [...list].sort(by);
  }, [teams, filter, search, sort]);

  return <main className="eval-page">
    <section className="eval-intro">
      <div>
        <h1>Your Round 1 PPTs</h1>
        <p>These are the teams assigned to you. Open one to read its PDF and score it on the official PPT Evaluation Sheet (11 criteria, 100 marks). Your scores are private to you and the organisers.</p>
      </div>
      <button type="button" className="eval-ghost" onClick={load}><RefreshCw size={15} /> Refresh</button>
    </section>

    {error ? <p className="eval-error" role="alert">{error}</p> : null}
    {!data && !error ? <p className="eval-muted">Loading your PPTs…</p> : null}
    {data && !teams.length ? <div className="eval-empty"><Users size={22} /><b>No PPTs assigned to you yet.</b><span>The organisers assign each PPT to {data.panelSize} evaluators. Check back soon, or contact them.</span></div> : null}

    {data && teams.length ? <>
      <Insights data={data.insights} teams={teams} panelSize={data.panelSize} resultsAt={data.resultsAt} />

      <div className="eval-toolbar">
        <div className="eval-filters" role="tablist">
          {FILTERS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)}>{label} <em>{counts[key] ?? 0}</em></button>)}
        </div>
        <label className="eval-search"><Search size={15} aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team, ID, college, theme" aria-label="Search" /></label>
        <label className="eval-sort"><span>Sort</span><select value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      {!shown.length ? <p className="eval-muted">No teams match.</p> : null}

      <ul className="eval-list">
        {shown.map((t) => {
          const s = STATUS[t.myStatus] || STATUS["not-started"];
          return <li key={t.id}>
            <Link to={`/evaluator/team/${t.id}`} className="eval-row">
              <span className="eval-row-id">{t.teamId}</span>
              <span className="eval-row-main"><b>{t.teamName}</b><small>{[t.college, t.theme, t.department, t.year].filter(Boolean).join(" · ")}</small></span>
              <span className="eval-row-meta" title="Team size · evaluators who have submitted this PPT"><Users size={13} aria-hidden="true" /> {t.teamSize} · <FileText size={13} aria-hidden="true" /> {t.panelSubmitted}/{t.panelSize} done</span>
              <span className={`eval-badge tone-${s.tone}`}><s.Icon size={14} aria-hidden="true" /> {s.label}{t.myTotal !== null && t.myStatus !== "not-started" ? ` · ${t.myTotal}/100` : ""}</span>
              {t.locked ? <span className="eval-badge tone-locked" title="Round 1 result decided; read-only"><Lock size={13} aria-hidden="true" /> Locked</span> : null}
              <ChevronRight size={18} className="eval-row-go" aria-hidden="true" />
            </Link>
          </li>;
        })}
      </ul>
    </> : null}
  </main>;
}

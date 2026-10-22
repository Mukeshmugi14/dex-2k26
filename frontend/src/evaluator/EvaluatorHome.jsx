import axios from "axios";
import { CheckCircle2, ChevronRight, CircleDashed, FileText, Lock, PencilLine, RefreshCw, Search } from "lucide-react";
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

export default function EvaluatorHome() {
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError("");
    axios.get(`${API_URL}/evaluator/teams`, { headers: evaluatorHeaders() })
      .then((response) => setTeams(response.data.teams))
      .catch((requestError) => {
        if (requestError.response?.status === 401) { clearEvaluatorSession(); navigate("/evaluator/login", { replace: true }); return; }
        setError(requestError.response?.data?.message || "Unable to load the submissions. Check your connection and try again.");
      });
  }, [navigate]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([key]) => [key, (teams || []).filter((t) => key === "all" || t.myStatus === key).length])), [teams]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (teams || []).filter((t) => (filter === "all" || t.myStatus === filter)
      && (!term || [t.teamId, t.teamName, t.college, t.theme, t.department].some((v) => String(v || "").toLowerCase().includes(term))));
  }, [teams, filter, search]);

  return <main className="eval-page">
    <section className="eval-intro">
      <div>
        <h1>Round 1 PPT submissions</h1>
        <p>Open a team to read its PDF and score it on the official PPT Evaluation Sheet (11 criteria, 100 marks). Your scores are private to you and the organisers.</p>
      </div>
      {teams ? <div className="eval-progress" aria-label="Your progress">
        <b>{counts.submitted}</b><span>of {teams.length} submitted</span>
        <i style={{ "--p": teams.length ? counts.submitted / teams.length : 0 }} />
      </div> : null}
    </section>

    <div className="eval-toolbar">
      <div className="eval-filters" role="tablist">
        {FILTERS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)}>{label} <em>{counts[key] ?? 0}</em></button>)}
      </div>
      <label className="eval-search"><Search size={15} aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team, ID, college, theme" aria-label="Search" /></label>
      <button type="button" className="eval-ghost" onClick={load}><RefreshCw size={15} /> Refresh</button>
    </div>

    {error ? <p className="eval-error" role="alert">{error}</p> : null}
    {!teams && !error ? <p className="eval-muted">Loading submissions…</p> : null}
    {teams && !shown.length ? <p className="eval-muted">No teams match.</p> : null}

    <ul className="eval-list">
      {shown.map((t) => {
        const s = STATUS[t.myStatus] || STATUS["not-started"];
        return <li key={t.id}>
          <Link to={`/evaluator/team/${t.id}`} className="eval-row">
            <span className="eval-row-id">{t.teamId}</span>
            <span className="eval-row-main"><b>{t.teamName}</b><small>{[t.college, t.theme, t.department, t.year].filter(Boolean).join(" · ")}</small></span>
            <span className="eval-row-file"><FileText size={14} aria-hidden="true" /> PDF</span>
            <span className={`eval-badge tone-${s.tone}`}><s.Icon size={14} aria-hidden="true" /> {s.label}{t.myTotal !== null && t.myStatus !== "not-started" ? ` · ${t.myTotal}/100` : ""}</span>
            {t.locked ? <span className="eval-badge tone-locked" title="Round 1 result decided; read-only"><Lock size={13} aria-hidden="true" /> Locked</span> : null}
            <ChevronRight size={18} className="eval-row-go" aria-hidden="true" />
          </Link>
        </li>;
      })}
    </ul>
  </main>;
}

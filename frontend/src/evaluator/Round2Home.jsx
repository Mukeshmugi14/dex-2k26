import axios from "axios";
import { CheckCircle2, ChevronRight, CircleDashed, Cpu, Lock, Monitor, PencilLine, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL } from "../config/api";
import { clearEvaluatorSession, evaluatorHeaders } from "../config/evaluatorSession";

const STATUS = {
  "not-started": { label: "Not started", Icon: CircleDashed, tone: "todo" },
  draft: { label: "Draft saved", Icon: PencilLine, tone: "draft" },
  submitted: { label: "Submitted", Icon: CheckCircle2, tone: "done" },
};
const TYPE = { SOFTWARE: { label: "Software", Icon: Monitor }, HARDWARE: { label: "Hardware", Icon: Cpu } };
const FILTERS = [["all", "All"], ["not-started", "Not started"], ["draft", "Drafts"], ["submitted", "Submitted"], ["SOFTWARE", "Software"], ["HARDWARE", "Hardware"]];
const ORDER = { draft: 0, "not-started": 1, submitted: 2 };

// Round 2: the prototypes of the selected teams on this evaluator's panel.
export default function Round2Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const load = useCallback(() => {
    return axios.get(`${API_URL}/evaluator/round2/teams`, { headers: evaluatorHeaders() })
      .then((r) => { setError(""); setData(r.data); })
      .catch((e) => {
        if (e.response?.status === 401) { clearEvaluatorSession(); navigate("/evaluator/login", { replace: true }); return; }
        setError(e.response?.data?.message || "Unable to load the prototypes. Check your connection and try again.");
      });
  }, [navigate]);
  useEffect(() => { load(); }, [load]);

  const teams = useMemo(() => data?.teams || [], [data]);
  const match = (t, key) => key === "all" || t.myStatus === key || t.category === key;
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [k, teams.filter((t) => match(t, k)).length])), [teams]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return teams.filter((t) => match(t, filter) && (!term || [t.teamId, t.teamName, t.college, t.theme].some((v) => String(v || "").toLowerCase().includes(term))))
      .sort((a, b) => ORDER[a.myStatus] - ORDER[b.myStatus] || a.teamId.localeCompare(b.teamId));
  }, [teams, filter, search]);
  const done = counts.submitted || 0;

  return <main className="eval-page">
    <section className="eval-intro">
      <div>
        <h1>Round 2 · Prototypes</h1>
        <p>Prototypes of the teams selected in Round 1. Every Round 2 evaluator scores every prototype; the final score is the average of all of you. Teams submit a website, Google Drive or YouTube link. YouTube videos and Drive files play right inside the sheet. Software and hardware each have their own 4 criteria (100 marks).</p>
      </div>
      <button type="button" className="eval-ghost" onClick={load}><RefreshCw size={15} /> Refresh</button>
    </section>
    {error ? <p className="eval-error" role="alert">{error}</p> : null}
    {!data && !error ? <p className="eval-muted">Loading prototypes…</p> : null}
    {data && !teams.length ? <div className="eval-empty"><Monitor size={22} /><b>No prototypes to score yet.</b><span>{data.notSubmittedYet ? `${data.notSubmittedYet} of your selected teams haven't submitted a prototype yet.` : "Prototypes appear here once selected teams submit them."}</span></div> : null}

    {data && teams.length ? <>
      <div className="eval-stats">
        <div className="eval-stat is-main"><small>Your prototypes</small><b>{done}<em> / {teams.length}</em></b><span>submitted</span><i style={{ "--p": teams.length ? done / teams.length : 0 }} /></div>
        <div className="eval-stat"><small>Left to score</small><b>{teams.length - done}</b><span>{counts.draft ? `${counts.draft} draft${counts.draft === 1 ? "" : "s"} in progress` : "none in progress"}</span></div>
        <div className="eval-stat"><small>Software · Hardware</small><b>{counts.SOFTWARE} · {counts.HARDWARE}</b><span>prototypes by type</span></div>
        <div className="eval-stat"><small>Not submitted yet</small><b>{data.notSubmittedYet}</b><span>selected teams without a prototype</span></div>
      </div>
      <div className="eval-toolbar" style={{ marginTop: 14 }}>
        <div className="eval-filters" role="tablist">
          {FILTERS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)}>{label} <em>{counts[key] ?? 0}</em></button>)}
        </div>
        <label className="eval-search"><Search size={15} aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team, ID, college, theme" aria-label="Search" /></label>
      </div>
      {!shown.length ? <p className="eval-muted">No teams match.</p> : null}
      <ul className="eval-list">
        {shown.map((t) => {
          const s = STATUS[t.myStatus] || STATUS["not-started"];
          const type = TYPE[t.category] || TYPE.SOFTWARE;
          return <li key={t.id}>
            <Link to={`/evaluator/round2/team/${t.id}`} className="eval-row">
              <span className="eval-row-id">{t.teamId}</span>
              <span className="eval-row-main"><b>{t.teamName}</b><small>{[t.college, t.theme].filter(Boolean).join(" · ")}</small></span>
              <span className={`eval-badge tone-type is-${(t.category || "").toLowerCase()}`}><type.Icon size={13} aria-hidden="true" /> {type.label}</span>
              <span className={`eval-badge tone-${s.tone}`}><s.Icon size={14} aria-hidden="true" /> {s.label}{t.myTotal !== null && t.myStatus !== "not-started" ? ` · ${t.myTotal}/100` : ""}</span>
              {t.locked ? <span className="eval-badge tone-locked"><Lock size={13} aria-hidden="true" /> Locked</span> : null}
              <ChevronRight size={18} className="eval-row-go" aria-hidden="true" />
            </Link>
          </li>;
        })}
      </ul>
    </> : null}
  </main>;
}

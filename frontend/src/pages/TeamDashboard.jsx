import axios from "axios";
import { Check, Circle, Clock3, Eye, FileText, LogOut, RefreshCw, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./TeamPortal.css";
import { API_URL } from "../config/api";
import { clearTeamToken, getTeamToken } from "../config/teamSession";

const STATUS = {
  COMPLETED: { label: "Completed", icon: Check, mark: "✓" },
  SELECTED: { label: "Selected", icon: Check, mark: "✓" },
  LIVE: { label: "Live", icon: Circle, mark: "●" },
  PENDING: { label: "Pending", icon: Clock3, mark: "◌" },
  UPCOMING: { label: "Upcoming", icon: Circle, mark: "○" },
  NOT_SELECTED: { label: "Not Selected", icon: X, mark: "✕" },
};
const REFRESH_MS = 60_000;
const formatDate = (value) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "");
const statusClass = (status) => `team-status team-status-${status.toLowerCase().replace("_", "-")}`;

// One small runner per registered member, running together toward the next round.
function RunnerFigure() {
  return <svg viewBox="0 0 24 32" aria-hidden="true" focusable="false">
    <g className="runner-arm runner-arm-back"><path d="M12.5 11.5 L8 14.5 L6 12.5" /></g>
    <g className="runner-leg runner-leg-back"><path d="M10 19 L6.5 24.5 L3 27" /></g>
    <path className="runner-body" d="M13.2 9.6 L10 19" />
    <circle className="runner-head" cx="14.4" cy="5.4" r="3.1" />
    <g className="runner-leg runner-leg-front"><path d="M10 19 L14.5 24 L13.5 30" /></g>
    <g className="runner-arm runner-arm-front"><path d="M12.5 11.5 L16.5 14.5 L19.5 12.5" /></g>
  </svg>;
}

function TeamRunners({ count, stopped }) {
  if (!count) return null;
  return <div className={`team-runners ${stopped ? "is-stopped" : ""}`} role="img" aria-label={stopped ? `${count} team members` : `${count} team members running toward the next round`}>
    <div className="team-runners-pack">
      {Array.from({ length: count }, (_, index) => <span className="team-runner" key={index} style={{ "--i": index }}><RunnerFigure /></span>)}
    </div>
    {stopped ? null : <span className="team-runners-arrow" aria-hidden="true">→</span>}
  </div>;
}

function RoundTracker({ rounds }) {
  const stopIndex = rounds.findIndex((round) => round.status === "NOT_SELECTED");
  const visible = stopIndex >= 0 ? rounds.slice(0, stopIndex + 1) : rounds;
  return <ol className="team-tracker">
    {visible.map((round, index) => {
      const info = STATUS[round.status] || STATUS.UPCOMING;
      const Icon = info.icon;
      return <li key={round.key} className={`team-tracker-step step-${round.status.toLowerCase().replace("_", "-")}`}>
        <div className="team-tracker-node" aria-hidden="true"><Icon size={16} strokeWidth={3} /></div>
        {index < visible.length - 1 ? <div className="team-tracker-line" aria-hidden="true" /> : null}
        <div className="team-tracker-body">
          <b>Round {round.number}</b>
          <span>{round.title}</span>
          <em className={statusClass(round.status)}>{info.mark} {info.label}</em>
        </div>
      </li>;
    })}
  </ol>;
}

export default function TeamDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const logout = useCallback(() => { clearTeamToken(); navigate("/team-login", { replace: true }); }, [navigate]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await axios.get(`${API_URL}/team/me`, { headers: { Authorization: `Bearer ${getTeamToken()}` } });
      setData(response.data);
      setError("");
    } catch (requestError) {
      if (requestError.response?.status === 401) { logout(); return; }
      setError("Unable to load your team details. Please check your connection.");
    } finally {
      setRefreshing(false);
    }
  }, [logout]);

  // Keep the round status current: refresh on load, when the tab regains focus, and every minute.
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [load]);

  const viewPdf = async () => {
    setPdfError("");
    const viewer = window.open("", "_blank");
    try {
      const response = await axios.get(`${API_URL}/team/me/pdf`, { headers: { Authorization: `Bearer ${getTeamToken()}` }, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      if (viewer) viewer.location.href = url; else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (requestError) {
      viewer?.close();
      if (requestError.response?.status === 401) { logout(); return; }
      setPdfError("Unable to open your PDF. Please try again.");
    }
  };

  const header = <header className="team-topbar">
    <div><span className="team-brand">DE<b>X</b>ATHON <em>2026</em></span><small>Team Head Portal</small></div>
    <div className="team-topbar-user">{data ? <span>{data.team.teamHead}</span> : null}<button type="button" onClick={logout}><LogOut size={15} /> Logout</button></div>
  </header>;

  if (!data) return <main className="team-portal team-dash">{header}<div className="team-dash-inner"><p className="team-state">{error || "Loading your team dashboard..."}</p>{error ? <button type="button" className="team-retry" onClick={load}>Retry</button> : null}</div></main>;

  const { team, submission, rounds, current, evaluation } = data;
  const currentInfo = STATUS[current.status] || STATUS.UPCOMING;
  const notSelected = current.status === "NOT_SELECTED";

  return <main className="team-portal team-dash">
    {header}
    <div className="team-dash-inner">
      <section className={`team-current ${notSelected ? "is-stopped" : ""}`}>
        <div>
          <span>Current Status</span>
          <h1>Round {current.round}</h1>
        </div>
        <strong className={statusClass(current.status)}>{currentInfo.mark} {currentInfo.label}</strong>
        <TeamRunners count={team.members.length} stopped={notSelected} />
        <button type="button" className="team-refresh" onClick={load} disabled={refreshing} aria-label="Refresh status"><RefreshCw size={15} className={refreshing ? "spin" : ""} /></button>
        {notSelected ? <p className="team-current-message">Thank you for participating in DEXATHON 2026.<br />Your team was not selected for the next round.</p> : null}
      </section>
      {error ? <p className="team-inline-error">{error}</p> : null}

      <div className="team-grid">
        <section className="team-card team-area-details">
          <h2>Team Details</h2>
          <dl className="team-details">
            <div><dt>Team Name</dt><dd>{team.teamName}</dd></div>
            <div><dt>Team Head</dt><dd>{team.teamHead}</dd></div>
            <div><dt>Team Head Email</dt><dd className="break">{team.teamHeadEmail}</dd></div>
            <div><dt>College</dt><dd>{team.college}</dd></div>
          </dl>
        </section>

        <section className="team-card team-area-members">
          <h2><Users size={17} /> Team Members</h2>
          {team.members.length ? <ol className="team-members">{team.members.map((name, index) => <li key={name}><b>{String(index + 1).padStart(2, "0")}.</b> {name}</li>)}</ol> : <p className="team-muted">No team members are recorded.</p>}
        </section>

        <section className="team-card team-area-pdf">
          <h2><FileText size={17} /> Your Submission</h2>
          {submission.submitted ? <>
            <div className="team-pdf-file"><FileText size={22} /><div><b>{submission.fileName}</b><span>Submitted {formatDate(submission.submittedAt)}</span></div></div>
            <div className="team-pdf-status"><span>Status</span><span className="team-pill ok">✓ Submitted</span></div>
            <button type="button" className="team-action" onClick={viewPdf}><Eye size={16} /> View PDF</button>
            {pdfError ? <p className="team-inline-error">{pdfError}</p> : null}
          </> : <>
            <div className="team-pdf-status"><span>Status</span><span className="team-pill">Not Submitted</span></div>
            <p className="team-muted">Please submit your PDF using the submission link sent to your registered email.</p>
          </>}
          {evaluation ? <div className="team-score"><div><span>Evaluation Score</span><b>{evaluation.totalScore}</b></div><div><span>Result</span><b>{evaluation.result}</b></div></div> : null}
        </section>

        <section className="team-card team-area-progress">
          <h2>Round Progress</h2>
          <RoundTracker rounds={rounds} />
        </section>
      </div>
    </div>
  </main>;
}

import axios from "axios";
import { Check, Mail, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AdminTeams.css";
import "./AdminPdfSubmissions.css";
import "./AdminRoundSelection.css";
import { API_URL } from "../config/api";
import { AdminPagination, AdminSkeleton, usePagedList } from "../components/AdminListParts";

const ROUNDS = [1, 2, 3];
const FINAL_ROUND = 3;
const ROUND_FILTERS = [["ALL", "All"], ["1", "Round 1"], ["2", "Round 2"], ["3", "Round 3"], ["NOT_SELECTED", "Not Selected"]];
const STATUS_FILTERS = [["ALL", "All"], ["PENDING", "Pending"], ["SELECTED", "Selected"], ["REJECTED", "Rejected"]];
const LABEL = { PENDING: "Pending", SELECTED: "Selected", REJECTED: "Rejected" };
const MARK = { PENDING: "○", SELECTED: "✓", REJECTED: "✕" };

// Latest decided round result (for "All rounds" + status filters).
const latestDecision = (team) => [...ROUNDS].reverse().map((n) => team.results[n].status).find((status) => status !== "PENDING") || "PENDING";

const matchesFilters = (team, roundFilter, statusFilter) => {
  if (roundFilter === "NOT_SELECTED") return team.overall === "REJECTED" && ["ALL", "REJECTED"].includes(statusFilter);
  if (roundFilter === "ALL") {
    if (statusFilter === "ALL") return true;
    if (statusFilter === "PENDING") return team.overall === "PENDING";
    if (statusFilter === "REJECTED") return team.overall === "REJECTED";
    return latestDecision(team) === "SELECTED";
  }
  const round = Number(roundFilter);
  const status = team.results[round].status;
  const inRound = status !== "PENDING" || (team.currentRound === round && team.overall !== "REJECTED");
  return inRound && (statusFilter === "ALL" || status === statusFilter);
};

const summarize = (teams) => ({
  totalTeams: teams.length,
  round1Selected: teams.filter((t) => t.results[1].status === "SELECTED").length,
  round2Selected: teams.filter((t) => t.results[2].status === "SELECTED").length,
  round3Selected: teams.filter((t) => t.results[3].status === "SELECTED").length,
  notSelected: teams.filter((t) => t.overall === "REJECTED").length,
  pending: teams.filter((t) => t.overall === "PENDING").length,
});

const confirmCopy = (round, decision) => {
  const isFinal = round >= FINAL_ROUND;
  if (decision === "SELECTED") return { question: isFinal ? "Are you sure you want to select this team in the final round?" : "Are you sure you want to select this team for the next round?", action: "Confirm Selection" };
  return { question: isFinal ? "Are you sure you want to reject this team in the final round?" : "Are you sure you want to reject this team for the next round?", action: "Confirm Rejection" };
};

function ConfirmDialog({ pending, busy, onCancel, onConfirm }) {
  const { team, round, decision } = pending;
  const copy = confirmCopy(round, decision);
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);
  return <div className="edit-team-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section className="edit-team-modal rs-confirm" role="alertdialog" aria-modal="true" aria-labelledby="rs-confirm-title">
      <header><div><span>Round {round}</span><h2 id="rs-confirm-title">{team.teamName}</h2></div></header>
      <div className="edit-team-body">
        <p className={`rs-confirm-question ${decision === "SELECTED" ? "is-select" : "is-reject"}`}>{copy.question}</p>
        <p className="rs-confirm-note"><Mail size={14} /> The result email will be sent to {team.leader?.email}.</p>
      </div>
      <footer><div>
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={decision === "SELECTED" ? "" : "rs-danger"} onClick={onConfirm} disabled={busy} autoFocus>{busy ? "Saving..." : copy.action}</button>
      </div></footer>
    </section>
  </div>;
}

function TeamCard({ team, onDecide, onRetry, retrying }) {
  const defaultRound = team.decidableRounds.includes(team.currentRound) ? team.currentRound : team.decidableRounds[0];
  const [round, setRound] = useState(defaultRound);
  // Follow the team to its new current round after each decision (e.g. Round 1 selected → Round 2).
  useEffect(() => { setRound(defaultRound); }, [team.currentRound, defaultRound]);
  useEffect(() => { if (!team.decidableRounds.includes(round)) setRound(defaultRound); }, [team, round, defaultRound]);

  const currentStatus = team.results[team.currentRound].status;
  const chosen = round ? team.results[round] : null;
  return <article className="team-card rs-card">
    <div className="pdf-card-head"><h2>{team.teamName}</h2><span className={`rs-badge rs-${team.overall.toLowerCase()}`}>{team.overall === "REJECTED" ? "Not Selected" : team.overall === "SELECTED" ? "All Rounds Selected" : `Round ${team.currentRound} · Pending`}</span></div>
    <dl className="pdf-card-details">
      <div><dt>Team Head</dt><dd>{team.leader?.name}</dd></div>
      <div><dt>Email</dt><dd className="break">{team.leader?.email}</dd></div>
      <div><dt>College</dt><dd>{team.college}</dd></div>
      <div><dt>Current Round</dt><dd>Round {team.currentRound}</dd></div>
      <div><dt>Score</dt><dd>{team.score ?? "--"}</dd></div>
      <div><dt>Status</dt><dd><span className={`rs-text rs-${currentStatus.toLowerCase()}`}>{MARK[currentStatus]} {LABEL[currentStatus]}</span></dd></div>
    </dl>

    <ol className="rs-history" aria-label="Round history">
      {ROUNDS.map((n) => {
        const result = team.results[n];
        const decided = result.status !== "PENDING";
        return <li key={n} className={`rs-${result.status.toLowerCase()}`}>
          <b>Round {n}</b>
          <span>{MARK[result.status]} {LABEL[result.status]}</span>
          {decided ? (result.emailUpToDate
            ? <em className="rs-email ok">✓ Email Sent</em>
            : <em className="rs-email bad">Email not sent <button type="button" className="ghost" disabled={retrying === `${team._id}-${n}` || result.emailStatus === "Sending"} onClick={() => onRetry(team, n)}>{retrying === `${team._id}-${n}` ? "Sending..." : "Retry Email"}</button></em>) : null}
        </li>;
      })}
    </ol>

    {round ? <div className="rs-decide">
      <label><span>Evaluation Round</span>
        <select value={round} onChange={(event) => setRound(Number(event.target.value))}>
          {ROUNDS.map((n) => <option key={n} value={n} disabled={!team.decidableRounds.includes(n)}>Round {n}{team.decidableRounds.includes(n) ? "" : " (locked)"}</option>)}
        </select>
      </label>
      <div className="rs-actions">
        <button type="button" className={`rs-select ${chosen.status === "SELECTED" ? "is-current" : ""}`} onClick={() => onDecide(team, round, "SELECTED")}><Check size={16} strokeWidth={3} /> Selected</button>
        <button type="button" className={`rs-reject ${chosen.status === "REJECTED" ? "is-current" : ""}`} onClick={() => onDecide(team, round, "REJECTED")}><X size={16} strokeWidth={3} /> Rejected</button>
      </div>
    </div> : <p className="rs-locked">{team.overall === "SELECTED" ? "All rounds decided — this team was selected in every round." : "No round can be decided for this team."}</p>}
  </article>;
}

export default function AdminRoundSelection() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [roundFilter, setRoundFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(null);
  const [message, setMessage] = useState(null);
  const navigate = useNavigate();
  const token = localStorage.getItem("dexathon_admin_token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const logout = useCallback(() => { localStorage.removeItem("dexathon_admin_token"); navigate("/admin/login"); }, [navigate]);
  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    axios.get(`${API_URL}/admin/round-selection`, { headers })
      .then((response) => setTeams(response.data.teams))
      .catch((error) => { if (error.response?.status === 401) logout(); else setLoadError(error.response?.data?.message || "Unable to load teams."); })
      .finally(() => setLoading(false));
  }, [headers, logout]);
  useEffect(load, [load]);

  const replaceTeam = (updated) => setTeams((current) => current.map((team) => (team._id === updated._id ? updated : team)));
  const summary = useMemo(() => summarize(teams), [teams]);
  const visibleTeams = useMemo(() => {
    const term = search.trim().toLowerCase();
    return teams.filter((team) => matchesFilters(team, roundFilter, statusFilter)
      && (!term || [team.teamName, team.leader?.name, team.leader?.email].some((value) => value?.toLowerCase().includes(term))));
  }, [teams, roundFilter, statusFilter, search]);
  const paged = usePagedList(visibleTeams, 24, `${roundFilter}|${statusFilter}|${search}`);

  const confirmDecision = async () => {
    setBusy(true);
    try {
      const response = await axios.put(`${API_URL}/admin/round-selection/${pending.team._id}`, { round: pending.round, decision: pending.decision }, { headers });
      replaceTeam(response.data.team);
      setMessage({ ok: response.data.email?.attempted ? response.data.email.sent : true, text: `${pending.team.teamName} — Round ${pending.round}: ${response.data.message}` });
      setPending(null);
    } catch (error) {
      if (error.response?.status === 401) { logout(); return; }
      setMessage({ ok: false, text: error.response?.data?.message || "Unable to save the decision. Please try again." });
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const retry = async (team, round) => {
    setRetrying(`${team._id}-${round}`);
    try {
      const response = await axios.post(`${API_URL}/admin/round-selection/${team._id}/email`, { round }, { headers });
      replaceTeam(response.data.team);
      setMessage({ ok: true, text: `${team.teamName} — Round ${round}: ${response.data.message}` });
    } catch (error) {
      if (error.response?.status === 401) { logout(); return; }
      if (error.response?.data?.team) replaceTeam(error.response.data.team);
      setMessage({ ok: false, text: `${team.teamName} — Round ${round}: ${error.response?.data?.message || "Email not sent. Please try again."}` });
    } finally {
      setRetrying(null);
    }
  };

  const tiles = [["Total Teams", summary.totalTeams], ["Round 1 Selected", summary.round1Selected], ["Round 2 Selected", summary.round2Selected], ["Round 3 Selected", summary.round3Selected], ["Not Selected", summary.notSelected], ["Pending", summary.pending]];

  return <main className="admin-teams admin-pdf admin-rs">
    <header className="admin-teams-header">
      <div><p>DEXATHON 2026 ADMIN</p><h1>Round Selection</h1><span>Select or reject teams round by round. Results are emailed and shown in the Team Head Portal.</span></div>
      <nav><Link to="/admin/dashboard">Dashboard</Link><Link to="/admin/payment-history">Payment History</Link><Link to="/admin/teams">Teams</Link><Link to="/admin/pdf-submissions">PDF Submissions</Link><Link to="/admin/rounds">Round Status</Link><Link to="/admin/round-selection" aria-current="page">Round Selection</Link><Link to="/admin/payment-settings">Payment Settings</Link><button type="button" onClick={logout}>Logout</button></nav>
    </header>

    {message ? <p className={`admin-teams-message ${message.ok ? "" : "is-error"}`} role="status">{message.text}<button type="button" aria-label="Dismiss" onClick={() => setMessage(null)}><X size={14} /></button></p> : null}

    <section className="rs-summary" aria-label="Summary">
      {tiles.map(([labelText, value]) => <div key={labelText}><span>{labelText}</span><b>{value}</b></div>)}
    </section>

    <section className="admin-teams-toolbar pdf-toolbar">
      <div className="rs-filter-row"><span>Round</span><div className="pdf-filters" role="group" aria-label="Round filter">
        {ROUND_FILTERS.map(([value, text]) => <button type="button" key={value} className={roundFilter === value ? "active" : ""} onClick={() => setRoundFilter(value)}>{text}</button>)}
      </div></div>
      <div className="rs-filter-row"><span>Status</span><div className="pdf-filters" role="group" aria-label="Status filter">
        {STATUS_FILTERS.map(([value, text]) => <button type="button" key={value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{text}</button>)}
      </div></div>
      <div className="pdf-toolbar-row"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Team Name / Team Head / Email" aria-label="Search teams" /><span className="rs-count">{visibleTeams.length} of {teams.length} teams</span></div>
    </section>

    {loading ? <AdminSkeleton rows={4} variant="cards" />
      : loadError ? <div className="admin-teams-state error"><p>{loadError}</p><button type="button" onClick={load}>Retry</button></div>
        : !visibleTeams.length ? <p className="admin-teams-state">{teams.length ? "No teams match these filters." : "No confirmed teams yet."}</p>
          : <section className="team-card-grid pdf-card-grid">{paged.pageItems.map((team) => <TeamCard key={team._id} team={team} retrying={retrying} onRetry={retry} onDecide={(t, round, decision) => { setMessage(null); setPending({ team: t, round, decision }); }} />)}</section>}
    {!loading && !loadError ? <AdminPagination page={paged.page} pages={paged.pages} total={paged.total} limit={paged.limit} onChange={paged.setPage} label="teams" /> : null}

    {pending ? <ConfirmDialog pending={pending} busy={busy} onCancel={() => setPending(null)} onConfirm={confirmDecision} /> : null}
  </main>;
}

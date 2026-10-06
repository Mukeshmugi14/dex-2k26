import axios from "axios";
import { Mail, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AdminTeams.css";
import "./AdminPdfSubmissions.css";
import "./AdminRounds.css";
import { API_URL } from "../config/api";
import AdminNav from "../components/AdminNav";
import { AdminPagination, AdminSkeleton, usePagedList } from "../components/AdminListParts";

const ROUND_KEYS = ["round1", "round2", "round3"];
const LABELS = { PENDING: "Pending", COMPLETED: "Completed", LIVE: "Live", SELECTED: "Selected", NOT_SELECTED: "Not Selected", UPCOMING: "Upcoming" };
const FILTERS = ["All", "LIVE", "PENDING", "SELECTED", "COMPLETED", "NOT_SELECTED", "UPCOMING"];
const badgeClass = (status) => `round-badge round-badge-${status.toLowerCase().replace("_", "-")}`;
const formatDate = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

function RoundCard({ team, allowed, headers, onUpdated, onUnauthorized }) {
  const [rounds, setRounds] = useState(team.rounds);
  const [scoreReleased, setScoreReleased] = useState(team.scoreReleased);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => { setRounds(team.rounds); setScoreReleased(team.scoreReleased); }, [team]);

  const stopIndex = ROUND_KEYS.findIndex((key) => rounds[key] === "NOT_SELECTED");
  const dirty = ROUND_KEYS.some((key) => rounds[key] !== team.rounds[key]) || scoreReleased !== team.scoreReleased;

  const handle = async (request) => {
    setNote("");
    try {
      const response = await request();
      onUpdated(response.data.team, response.data.message);
    } catch (error) {
      if (error.response?.status === 401) { onUnauthorized(); return; }
      if (error.response?.data?.team) onUpdated(error.response.data.team);
      setNote(error.response?.data?.message || "Unable to update. Please try again.");
    }
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    await handle(() => axios.put(`${API_URL}/admin/rounds/${team._id}`, { rounds, scoreReleased }, { headers }));
    setSaving(false);
  };

  const resend = async () => {
    setResending(true);
    await handle(() => axios.post(`${API_URL}/admin/rounds/${team._id}/email`, {}, { headers }));
    setResending(false);
  };

  return <form className="team-card round-card" onSubmit={save} noValidate>
    <div className="pdf-card-head"><h2>{team.teamName}</h2><span className={badgeClass(team.current.status)}>Round {team.current.round} · {LABELS[team.current.status]}</span></div>
    <dl className="pdf-card-details">
      <div><dt>Team Head</dt><dd>{team.leader?.name}</dd></div>
      <div><dt>Email</dt><dd className="break">{team.leader?.email}</dd></div>
      <div><dt>College</dt><dd>{team.college}</dd></div><div><dt>Project Theme</dt><dd>{team.projectTheme || "Not selected"}</dd></div>
    </dl>

    <div className="round-selects">
      {ROUND_KEYS.map((key, index) => {
        const lockedByStop = stopIndex >= 0 && index > stopIndex;
        return <label key={key}>
          <span>Round {index + 1}</span>
          <select value={lockedByStop ? "UPCOMING" : rounds[key]} disabled={saving || lockedByStop} onChange={(event) => { const value = event.target.value; setRounds((current) => { const next = { ...current, [key]: value }; if (value === "NOT_SELECTED") ROUND_KEYS.slice(index + 1).forEach((later) => { next[later] = "UPCOMING"; }); return next; }); }}>
            {allowed[key].map((status) => <option key={status} value={status}>{LABELS[status]}</option>)}
          </select>
        </label>;
      })}
    </div>
    {stopIndex >= 0 ? <p className="round-hint">The journey stops at Round {stopIndex + 1} (Not Selected); later rounds stay Upcoming.</p> : null}

    <label className={`round-release ${Number.isFinite(team.evaluation.totalScore) ? "" : "is-disabled"}`}>
      <input type="checkbox" checked={scoreReleased} disabled={saving || !Number.isFinite(team.evaluation.totalScore)} onChange={(event) => setScoreReleased(event.target.checked)} />
      <span>Show evaluation score to team {Number.isFinite(team.evaluation.totalScore) ? <b>({team.evaluation.totalScore} · {team.evaluation.result})</b> : <em>(not evaluated yet)</em>}</span>
    </label>

    <div className="round-email">
      <Mail size={13} />
      {team.email.status === "Sent" && team.email.upToDate ? <span className="ok">Round update email sent · {formatDate(team.email.sentAt)}</span>
        : team.email.status === "Failed" ? <><span className="bad">Status saved, but the email could not be sent.</span><button type="button" className="ghost" onClick={resend} disabled={resending}>{resending ? "Sending..." : "Resend Email"}</button></>
          : team.email.status === "Sent" ? <><span>Last email was for an earlier status.</span><button type="button" className="ghost" onClick={resend} disabled={resending}>{resending ? "Sending..." : "Send Update Email"}</button></>
            : <span>No round update email sent yet.</span>}
    </div>
    {note ? <p className="pdf-error" role="alert">{note}</p> : null}

    <footer>
      <span>{team.updatedAt ? `Updated ${formatDate(team.updatedAt)}` : team.teamId}</span>
      <button type="submit" disabled={saving || !dirty}>{saving ? "Updating..." : "Update Status"}</button>
    </footer>
  </form>;
}

export default function AdminRounds() {
  const [teams, setTeams] = useState([]);
  const [allowed, setAllowed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const token = localStorage.getItem("dexathon_admin_token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const logout = useCallback(() => { localStorage.removeItem("dexathon_admin_token"); localStorage.removeItem("dexathon_admin_profile"); navigate("/admin/login"); }, [navigate]);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    axios.get(`${API_URL}/admin/rounds`, { headers })
      .then((response) => { setTeams(response.data.teams); setAllowed(response.data.allowed); })
      .catch((error) => { if (error.response?.status === 401) logout(); else setLoadError(error.response?.data?.message || "Unable to load round status."); })
      .finally(() => setLoading(false));
  }, [headers, logout]);

  useEffect(load, [load]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((status) => [status, status === "All" ? teams.length : teams.filter((team) => team.current.status === status).length])), [teams]);
  const visibleTeams = useMemo(() => {
    const term = search.trim().toLowerCase();
    return teams.filter((team) => (filter === "All" || team.current.status === filter)
      && (!term || [team.teamName, team.leader?.name, team.leader?.email, team.teamId].some((value) => value?.toLowerCase().includes(term))));
  }, [teams, filter, search]);
  const paged = usePagedList(visibleTeams, 24, `${filter}|${search}`);

  const onUpdated = (updated, successMessage) => {
    setTeams((current) => current.map((team) => (team._id === updated._id ? updated : team)));
    if (successMessage) setMessage(`${updated.teamName}: ${successMessage}`);
  };

  return <main className="admin-teams admin-pdf admin-rounds">
    <header className="admin-teams-header">
      <div><p>DEXATHON 2026 ADMIN</p><h1>Round Status</h1><span>Set each team's official round progress. Team Heads see it in their portal.</span></div>
      <nav><AdminNav /></nav>
    </header>

    {message ? <p className="admin-teams-message" role="status">{message}<button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={14} /></button></p> : null}

    <section className="admin-teams-toolbar pdf-toolbar">
      <div className="pdf-filters" role="group" aria-label="Filter by current status">
        {FILTERS.map((status) => <button type="button" key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "All" ? "All" : LABELS[status]} <span>{counts[status] ?? 0}</span></button>)}
      </div>
      <div className="pdf-toolbar-row"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team name / team head / email" aria-label="Search teams" /></div>
    </section>

    {loading ? <AdminSkeleton rows={4} variant="cards" />
      : loadError ? <div className="admin-teams-state error"><p>{loadError}</p><button type="button" onClick={load}>Retry</button></div>
        : !visibleTeams.length ? <p className="admin-teams-state">{teams.length ? "No teams match this filter." : "No confirmed teams yet."}</p>
          : <section className="team-card-grid pdf-card-grid">{paged.pageItems.map((team) => <RoundCard key={team._id} team={team} allowed={allowed} headers={headers} onUpdated={onUpdated} onUnauthorized={logout} />)}</section>}
    {!loading && !loadError ? <AdminPagination page={paged.page} pages={paged.pages} total={paged.total} limit={paged.limit} onChange={paged.setPage} label="teams" /> : null}
  </main>;
}

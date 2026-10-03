import axios from "axios";
import { Download, Eye, Mail, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AdminTeams.css";
import "./AdminPdfSubmissions.css";
import { API_URL } from "../config/api";
import { AdminPagination, AdminSkeleton, usePagedList } from "../components/AdminListParts";

const STATUSES = ["Pending", "Submitted", "Under Review", "Selected", "Not Selected"];
const RESULTS = ["Pending", "Selected", "Not Selected"];
const CRITERIA = ["criterion1", "criterion2", "criterion3", "criterion4"];
const statusClass = (status) => `pdf-status pdf-status-${status.toLowerCase().replace(/\s+/g, "-")}`;
const formatDate = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const formatScore = (value) => (Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "--");

function ScoringSettings({ settings, headers, onSaved, onClose }) {
  const [max, setMax] = useState(settings.maxScorePerCriterion ?? "");
  const [labels, setLabels] = useState(settings.criteriaLabels);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    const maxValue = Number(max);
    if (!Number.isFinite(maxValue) || maxValue < 1 || maxValue > 1000) { setError("Enter a maximum score from 1 to 1000."); return; }
    if (labels.some((label) => !label.trim())) { setError("Give each criterion a name."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await axios.put(`${API_URL}/admin/evaluation-settings`, { maxScorePerCriterion: maxValue, criteriaLabels: labels.map((label) => label.trim()) }, { headers });
      onSaved(response.data.settings, response.data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to save the scoring settings.");
    } finally {
      setSaving(false);
    }
  };

  return <form className="pdf-settings" onSubmit={save} noValidate>
    <div className="pdf-settings-head">
      <div><b>Scoring settings</b><span>{settings.maxScorePerCriterion ? "Applies to every team's evaluation." : "Set the maximum score for each criterion before evaluating any PDF."}</span></div>
      {onClose ? <button type="button" className="ghost" onClick={onClose} aria-label="Close scoring settings"><X size={16} /></button> : null}
    </div>
    <div className="pdf-settings-grid">
      <label>Maximum score per criterion<input type="number" min="1" max="1000" step="1" inputMode="numeric" value={max} onChange={(event) => setMax(event.target.value)} placeholder="e.g. 25" /></label>
      {labels.map((label, index) => <label key={index}>Criterion {index + 1} name<input value={label} maxLength={60} onChange={(event) => setLabels((current) => current.map((value, valueIndex) => (valueIndex === index ? event.target.value : value)))} /></label>)}
    </div>
    {error ? <p className="pdf-error" role="alert">{error}</p> : null}
    <div className="pdf-settings-actions"><span>Total possible: <b>{Number(max) > 0 ? Number(max) * 4 : "--"}</b></span><button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Scoring Settings"}</button></div>
  </form>;
}

function EvaluateModal({ team, settings, headers, onClose, onSaved, openPdf }) {
  const [scores, setScores] = useState(() => CRITERIA.map((key) => (Number.isFinite(team.evaluation?.[key]) ? String(team.evaluation[key]) : "")));
  const [result, setResult] = useState(team.evaluation?.result || "Pending");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const max = settings.maxScorePerCriterion;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  const numbers = scores.map((value) => (value.trim() === "" ? NaN : Number(value)));
  const allValid = numbers.every((value) => Number.isFinite(value) && value >= 0 && value <= max);
  const total = allValid ? Math.round(numbers.reduce((sum, value) => sum + value, 0) * 100) / 100 : null;
  const willEmail = result === "Selected" && !team.selectionEmailSent;

  const validate = () => {
    const next = {};
    numbers.forEach((value, index) => {
      if (!Number.isFinite(value) || value < 0 || value > max) next[CRITERIA[index]] = `Enter a score from 0 to ${max}.`;
      else if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) next[CRITERIA[index]] = "Use at most 2 decimal places.";
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!validate()) { setFormError("Please correct the highlighted fields."); return; }
    setSaving(true);
    setFormError("");
    try {
      const response = await axios.put(`${API_URL}/admin/pdf-submissions/${team._id}/evaluation`, { scores: numbers, result }, { headers });
      onSaved(response.data.registration, response.data.message);
    } catch (requestError) {
      setErrors(requestError.response?.data?.errors || {});
      setFormError(requestError.response?.data?.message || "Unable to save the evaluation. Try again.");
      setSaving(false);
    }
  };

  return <div className="edit-team-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form className="edit-team-modal" role="dialog" aria-modal="true" aria-labelledby="evaluate-title" onSubmit={submit} noValidate>
      <header>
        <div><span>{team.teamId}</span><h2 id="evaluate-title">Evaluate {team.teamName}</h2></div>
        <button type="button" className="edit-team-close" aria-label="Close" onClick={onClose} disabled={saving}><X size={18} /></button>
      </header>

      <div className="edit-team-body">
        <div className="pdf-eval-file">
          <div><b>{team.pdfSubmission.fileName}</b><span>Submitted {formatDate(team.pdfSubmission.submittedAt)}</span></div>
          <button type="button" className="ghost" onClick={() => openPdf(team, false)}><Eye size={15} /> View PDF</button>
        </div>

        <section className="pdf-eval-scores">
          <span className="edit-team-label">Evaluation</span>
          {CRITERIA.map((key, index) => <label key={key} className={`pdf-eval-row ${errors[key] ? "has-error" : ""}`}>
            <span>{settings.criteriaLabels[index]}</span>
            <div><input type="number" inputMode="decimal" min="0" max={max} step="0.5" value={scores[index]} disabled={saving}
              onChange={(event) => { const value = event.target.value; setScores((current) => current.map((score, scoreIndex) => (scoreIndex === index ? value : score))); setErrors((current) => ({ ...current, [key]: "" })); }} />
              <em>/ {max}</em></div>
            {errors[key] ? <small>{errors[key]}</small> : null}
          </label>)}
          <div className="pdf-eval-total"><span>Total Score</span><b>{total ?? "--"}<em> / {max * 4}</em></b></div>
        </section>

        <label className={`edit-team-field ${errors.result ? "has-error" : ""}`}>
          <span>Result</span>
          <select value={result} disabled={saving} onChange={(event) => setResult(event.target.value)}>
            {RESULTS.map((value) => <option key={value} value={value}>{value === "Pending" ? "Pending (not decided)" : value}</option>)}
          </select>
          {errors.result ? <small>{errors.result}</small> : null}
        </label>

        {team.selectionEmailSent ? <p className="pdf-eval-note"><Mail size={14} /> Second Round Email Sent on {formatDate(team.selectionEmailSentAt)}.</p>
          : willEmail ? <p className="pdf-eval-note info"><Mail size={14} /> Saving as Selected will send the Second Round email to {team.leader?.email}.</p> : null}
      </div>

      <footer>
        {formError ? <p className="edit-team-form-error" role="alert">{formError}</p> : null}
        <div>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Evaluation"}</button>
        </div>
      </footer>
    </form>
  </div>;
}

export default function AdminPdfSubmissions() {
  const [teams, setTeams] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [evaluating, setEvaluating] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState("");
  const [retrying, setRetrying] = useState(null);
  const navigate = useNavigate();
  const token = localStorage.getItem("dexathon_admin_token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const logout = useCallback(() => { localStorage.removeItem("dexathon_admin_token"); navigate("/admin/login"); }, [navigate]);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    axios.get(`${API_URL}/admin/pdf-submissions`, { headers })
      .then((response) => { setTeams(response.data.teams); setSettings(response.data.settings); })
      .catch((error) => { if (error.response?.status === 401) logout(); else setLoadError(error.response?.data?.message || "Unable to load PDF submissions."); })
      .finally(() => setLoading(false));
  }, [headers, logout]);

  useEffect(load, [load]);

  // PDFs are private: fetch them with the admin token, then open or download the in-memory copy.
  const openPdf = async (team, download) => {
    const viewer = download ? null : window.open("", "_blank");
    try {
      const response = await axios.get(`${API_URL}/admin/pdf-submissions/${team._id}/pdf`, { headers, responseType: "blob", params: download ? { download: 1 } : {} });
      const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      if (download) {
        const link = document.createElement("a");
        link.href = url;
        link.download = team.pdfSubmission.fileName || `${team.teamName}.pdf`;
        document.body.append(link);
        link.click();
        link.remove();
      } else if (viewer) {
        viewer.location.href = url;
      } else {
        window.location.assign(url);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      viewer?.close();
      if (error.response?.status === 401) { logout(); return; }
      setMessage("Unable to open the PDF. Please try again.");
    }
  };

  const counts = useMemo(() => Object.fromEntries(["All", ...STATUSES].map((status) => [status, status === "All" ? teams.length : teams.filter((team) => team.pdfSubmission.status === status).length])), [teams]);

  const visibleTeams = useMemo(() => {
    const term = search.trim().toLowerCase();
    return teams.filter((team) => (filter === "All" || team.pdfSubmission.status === filter)
      && (!term || [team.teamName, team.leader?.name, team.leader?.email, team.teamId].some((value) => value?.toLowerCase().includes(term))));
  }, [teams, filter, search]);
  const paged = usePagedList(visibleTeams, 24, `${filter}|${search}`);

  const retryEmail = async (team) => {
    setRetrying(team._id);
    setMessage("");
    try {
      const response = await axios.post(`${API_URL}/admin/pdf-submissions/${team._id}/selection-email`, {}, { headers });
      setTeams((current) => current.map((item) => (item._id === team._id ? response.data.registration : item)));
      setMessage(response.data.message);
    } catch (error) {
      if (error.response?.status === 401) { logout(); return; }
      if (error.response?.data?.registration) setTeams((current) => current.map((item) => (item._id === team._id ? error.response.data.registration : item)));
      setMessage(error.response?.data?.message || "Email could not be sent. Please try again.");
    } finally {
      setRetrying(null);
    }
  };

  const handleSaved = (registration, successMessage) => {
    setTeams((current) => current.map((team) => (team._id === registration._id ? registration : team)));
    setEvaluating(null);
    setMessage(successMessage || "Evaluation saved successfully.");
  };

  const scoringReady = Boolean(settings?.maxScorePerCriterion);

  return <main className="admin-teams admin-pdf">
    <header className="admin-teams-header">
      <div><p>DEXATHON 2026 ADMIN</p><h1>PDF Submissions</h1><span>Review second-round PDFs, score them and publish results.</span></div>
      <nav><Link to="/admin/dashboard">Dashboard</Link><Link to="/admin/payment-history">Payment History</Link><Link to="/admin/teams">Teams</Link><Link to="/admin/pdf-submissions" aria-current="page">PDF Submissions</Link><Link to="/admin/rounds">Round Status</Link><Link to="/admin/round-selection">Round Selection</Link><Link to="/admin/payment-settings">Payment Settings</Link><button type="button" onClick={logout}>Logout</button></nav>
    </header>

    {message ? <p className="admin-teams-message" role="status">{message}<button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={14} /></button></p> : null}

    {settings && (!scoringReady || showSettings) ? <ScoringSettings settings={settings} headers={headers} onClose={scoringReady ? () => setShowSettings(false) : null}
      onSaved={(next, savedMessage) => { setSettings(next); setShowSettings(false); setMessage(savedMessage); }} /> : null}

    <section className="admin-teams-toolbar pdf-toolbar">
      <div className="pdf-filters" role="group" aria-label="Filter by status">
        {["All", ...STATUSES].map((status) => <button type="button" key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status} <span>{counts[status] ?? 0}</span></button>)}
      </div>
      <div className="pdf-toolbar-row">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team name / team head / email" aria-label="Search submissions" />
        {scoringReady && !showSettings ? <button type="button" className="pdf-settings-toggle" onClick={() => setShowSettings(true)}><Settings2 size={15} /> Scoring: max {settings.maxScorePerCriterion} × 4</button> : null}
      </div>
    </section>

    {loading ? <AdminSkeleton rows={4} variant="cards" />
      : loadError ? <div className="admin-teams-state error"><p>{loadError}</p><button type="button" onClick={load}>Retry</button></div>
        : !visibleTeams.length ? <p className="admin-teams-state">{teams.length ? "No teams match this filter." : "No confirmed teams yet. Teams appear here once their payment is confirmed."}</p>
          : <section className="team-card-grid pdf-card-grid">{paged.pageItems.map((team) => {
            const status = team.pdfSubmission.status;
            const hasPdf = team.pdfSubmission.hasPdf;
            return <article className="team-card pdf-card" key={team._id}>
              <div className="pdf-card-head"><h2>{team.teamName}</h2><span className={statusClass(status)}>{status}</span></div>
              <dl className="pdf-card-details">
                <div><dt>Team Head</dt><dd>{team.leader?.name}</dd></div>
                <div><dt>Email</dt><dd className="break">{team.leader?.email}</dd></div>
                <div><dt>Phone</dt><dd>{team.leader?.phone}</dd></div>
                <div><dt>College</dt><dd>{team.college || team.collegeName}</dd></div>
                <div><dt>Submitted</dt><dd>{hasPdf ? formatDate(team.pdfSubmission.submittedAt) : "Not yet"}</dd></div>
              </dl>
              <div className="pdf-card-actions">
                <span>PDF</span>
                <button type="button" className="ghost" disabled={!hasPdf} onClick={() => openPdf(team, false)}><Eye size={14} /> View PDF</button>
                <button type="button" className="ghost" disabled={!hasPdf} onClick={() => openPdf(team, true)}><Download size={14} /> Download PDF</button>
              </div>
              <div className="pdf-card-score">
                <div><span>Score</span><b>{formatScore(team.evaluation?.totalScore)}</b></div>
                <div><span>Result</span><b className={`pdf-result-${(team.evaluation?.result || "Pending").toLowerCase().replace(/\s+/g, "-")}`}>{team.evaluation?.result || "Pending"}</b></div>
              </div>
              {team.selectionEmailSent ? <p className="pdf-card-email sent"><Mail size={13} /> Second Round Email Sent · {formatDate(team.selectionEmailSentAt)}</p>
                : team.evaluation?.result === "Selected" && team.selectionEmailStatus === "Failed" ? <div className="pdf-card-email failed"><span>Selection saved, but email could not be sent.</span><button type="button" className="ghost" disabled={retrying === team._id} onClick={() => retryEmail(team)}>{retrying === team._id ? "Sending..." : "Retry Email"}</button></div> : null}
              <footer>
                <span>{team.teamId}</span>
                <button type="button" disabled={!hasPdf || !scoringReady} title={!hasPdf ? "No PDF submitted yet" : !scoringReady ? "Set the scoring settings first" : undefined}
                  onClick={() => { setMessage(""); setEvaluating(team); }}>{team.evaluation?.evaluatedAt ? "Edit Evaluation" : "Evaluate"}</button>
              </footer>
            </article>;
          })}</section>}
    {!loading && !loadError ? <AdminPagination page={paged.page} pages={paged.pages} total={paged.total} limit={paged.limit} onChange={paged.setPage} label="teams" /> : null}

    {evaluating ? <EvaluateModal team={evaluating} settings={settings} headers={headers} openPdf={openPdf} onClose={() => setEvaluating(null)} onSaved={handleSaved} /> : null}
  </main>;
}

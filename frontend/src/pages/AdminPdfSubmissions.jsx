import axios from "axios";
import { Download, Eye, Mail, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminTeams.css";
import "./AdminPdfSubmissions.css";
import { API_URL } from "../config/api";
import { clearAdminSession, getAdminToken } from "../config/adminSession";
import useAutoRefresh from "../config/useAutoRefresh";
import AdminNav from "../components/AdminNav";
import { AdminPagination, AdminSkeleton, usePagedList } from "../components/AdminListParts";

const STATUSES = ["Pending", "Submitted", "Under Review", "Selected", "Not Selected"];
const RESULTS = ["Pending", "Selected", "Not Selected"];
const statusClass = (status) => `pdf-status pdf-status-${status.toLowerCase().replace(/\s+/g, "-")}`;
const formatDate = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const formatScore = (value) => (Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "--");

const SHEET_STATUS = { submitted: "Submitted", draft: "Draft" };

// Every evaluator's full PPT Evaluation Sheet for one team.
function SheetDetails({ teamId, headers }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    axios.get(`${API_URL}/admin/pdf-submissions/${teamId}/evaluation-sheets`, { headers })
      .then((r) => setData(r.data)).catch((e) => setError(e.response?.data?.message || "Unable to load the sheets."));
  }, [teamId, headers]);
  if (error) return <p className="pdf-error">{error}</p>;
  if (!data) return <p className="pdf-eval-note">Loading sheets…</p>;
  if (!data.sheets.length) return <p className="pdf-eval-note">No evaluator has opened this team yet.</p>;
  return <div className="pdf-sheets">{data.sheets.map((sheet) => <details key={sheet.email} className="pdf-sheet">
    <summary><b>{sheet.evaluator}</b> · {SHEET_STATUS[sheet.status]} · <b>{sheet.total}</b>/100{sheet.recommendation ? ` · ${sheet.recommendation}` : ""}</summary>
    {sheet.projectTitle || sheet.psCategory ? <p>{[sheet.projectTitle && `Project: ${sheet.projectTitle}`, sheet.psCategory && `PS: ${sheet.psCategory}`, sheet.panel && `Panel: ${sheet.panel}`].filter(Boolean).join(" · ")}</p> : null}
    <p>Checks: {data.rubric.submissionChecks.map((c) => `${sheet.checks[c.id] ? "✓" : "✗"} ${c.label}`).join(" · ")}{sheet.checks.missingSlides ? ` · Missing: ${sheet.checks.missingSlides}` : ""}</p>
    {sheet.policyFlags.length ? <p className="pdf-sheet-flag">Policy flag: {sheet.policyFlags.join(", ")}{sheet.policyNote ? ` — ${sheet.policyNote}` : ""}</p> : null}
    <table><thead><tr><th>Criterion</th><th>Level</th><th>Marks</th><th>Comment</th></tr></thead><tbody>
      {data.rubric.criteria.map((c) => { const level = sheet.levels[c.id]; return <tr key={c.id}><td>{c.id} {c.name}</td><td>{Number.isInteger(level) ? level : "–"}</td><td>{Number.isInteger(level) ? Math.round(((c.max * level) / 5) * 10) / 10 : "–"}/{c.max}</td><td>{sheet.comments[c.id] || ""}</td></tr>; })}
    </tbody></table>
    {sheet.strengths.some(Boolean) ? <p><b>Strengths:</b> {sheet.strengths.filter(Boolean).join(" · ")}</p> : null}
    {sheet.improvements.some(Boolean) ? <p><b>Improve:</b> {sheet.improvements.filter(Boolean).join(" · ")}</p> : null}
    <p className="pdf-sheet-meta">{sheet.coiDeclared ? "No conflict of interest declared" : "Declaration not given"} · {sheet.submittedAt ? `submitted ${formatDate(sheet.submittedAt)}` : `last saved ${formatDate(sheet.updatedAt)}`}</p>
  </details>)}</div>;
}

// The team's evaluation panel: each member's progress, and swapping a member (not one who already submitted).
function PanelEditor({ team, evaluators, panelSize, headers, onSaved }) {
  const current = team.panel || [];
  const [picks, setPicks] = useState(() => Array.from({ length: panelSize }, (_, i) => current[i]?.id || ""));
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const locked = (id) => current.some((m) => m.id === id && m.status === "submitted");
  const changed = picks.some((id, i) => id !== (current[i]?.id || ""));
  const save = async () => {
    setSaving(true); setNote("");
    try {
      const r = await axios.put(`${API_URL}/admin/pdf-submissions/${team._id}/panel`, { evaluatorIds: picks.filter(Boolean) }, { headers });
      setNote(r.data.message); onSaved();
    } catch (e) { setNote(e.response?.data?.message || "Unable to save the panel."); }
    finally { setSaving(false); }
  };
  return <div className="pdf-panel">
    <ul className="pdf-sheet-list">{picks.map((id, i) => {
      const member = current.find((m) => m.id === id);
      return <li key={i}>
        <select value={id} disabled={saving || locked(id)} onChange={(e) => setPicks((p) => p.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Panel member ${i + 1}`}>
          <option value="">— Not assigned —</option>
          {evaluators.filter((ev) => ev.id === id || !picks.includes(ev.id)).map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          {id && !evaluators.some((ev) => ev.id === id) ? <option value={id}>{member?.name || "Disabled evaluator"}</option> : null}
        </select>
        <span>{member ? ({ submitted: "Submitted", draft: "Draft", "not-started": "Not started" })[member.status] : "—"}</span>
        <b>{member?.total !== null && member?.total !== undefined ? `${member.total}/100` : "—"}</b>
        <span>{locked(id) ? "locked (submitted)" : ""}</span>
      </li>;
    })}</ul>
    {changed ? <button type="button" className="ghost" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save panel"}</button> : null}
    {note ? <p className="pdf-eval-note">{note}</p> : null}
  </div>;
}

function EvaluateModal({ team, headers, onClose, onSaved, openPdf, evaluators, panelSize, spreadAlert, onPanelSaved }) {
  const [result, setResult] = useState(team.evaluation?.result || "Pending");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showSheets, setShowSheets] = useState(false);
  const rubric = team.rubric || { count: 0, drafts: 0, average: null, sheets: [] };

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

  const willEmail = result === "Selected" && !team.selectionEmailSent;

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    try {
      const response = await axios.put(`${API_URL}/admin/pdf-submissions/${team._id}/evaluation`, { result }, { headers });
      onSaved(response.data.registration, response.data.message);
    } catch (requestError) {
      setErrors(requestError.response?.data?.errors || {});
      setFormError(requestError.response?.data?.message || "Unable to save the result. Try again.");
      setSaving(false);
    }
  };

  return <div className="edit-team-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form className="edit-team-modal pdf-review-modal" role="dialog" aria-modal="true" aria-labelledby="evaluate-title" onSubmit={submit} noValidate>
      <header>
        <div><span>{team.teamId}</span><h2 id="evaluate-title">Review {team.teamName}</h2></div>
        <button type="button" className="edit-team-close" aria-label="Close" onClick={onClose} disabled={saving}><X size={18} /></button>
      </header>

      <div className="edit-team-body">
        <div className="pdf-eval-file">
          <div><b>{team.pdfSubmission.fileName}</b><span>Submitted {formatDate(team.pdfSubmission.submittedAt)}</span></div>
          <button type="button" className="ghost" onClick={() => openPdf(team, false)}><Eye size={15} /> View PDF</button>
        </div>

        <section className="pdf-eval-scores">
          <span className="edit-team-label">Final score · weighted average of the panel sheets (out of 100)</span>
          <div className="pdf-eval-total"><span>{rubric.complete ? `Final — all ${rubric.panelSize || panelSize} counted evaluators submitted` : `Provisional — ${rubric.count} of ${rubric.panelSize || panelSize} counted sheets submitted${rubric.drafts ? ` (+${rubric.drafts} draft${rubric.drafts === 1 ? "" : "s"})` : ""}`}</span><b>{formatScore(rubric.average)}<em> / 100</em></b></div>
          {rubric.spread !== null && rubric.spread > spreadAlert ? <p className="pdf-eval-note info">⚠ The panel disagrees: totals differ by {rubric.spread} marks. Review the sheets before deciding.</p> : null}
          <span className="edit-team-label">Panel</span>
          <PanelEditor team={team} evaluators={evaluators} panelSize={panelSize} headers={headers} onSaved={onPanelSaved} />
          {rubric.sheets.some((sh) => sh.policyFlags.length) ? <p className="pdf-eval-note info">⚑ Policy flag raised: {[...new Set(rubric.sheets.flatMap((sh) => sh.policyFlags))].join(", ")}</p> : null}
          {!rubric.sheets.length ? <p className="pdf-eval-note">No evaluator has scored this team yet.{team.panel?.length ? "" : " Assign panels on the Evaluators page."}</p> : null}
          {rubric.sheets.length ? <button type="button" className="ghost" onClick={() => setShowSheets((v) => !v)}>{showSheets ? "Hide full sheets" : "Show full sheets"}</button> : null}
          {showSheets ? <SheetDetails teamId={team._id} headers={headers} /> : null}
        </section>

        <label className={`edit-team-field ${errors.result ? "has-error" : ""}`}>
          <span>Result</span>
          <select value={result} disabled={saving} onChange={(event) => setResult(event.target.value)}>
            {RESULTS.map((value) => <option key={value} value={value}>{value === "Pending" ? "Pending (not decided)" : value}</option>)}
          </select>
          {errors.result ? <small>{errors.result}</small> : null}
        </label>
        <p className="pdf-eval-note">Once a result other than Pending is saved, evaluators can no longer change their sheets for this team.</p>

        {team.selectionEmailSent ? <p className="pdf-eval-note"><Mail size={14} /> Second Round Email Sent on {formatDate(team.selectionEmailSentAt)}.</p>
          : willEmail ? <p className="pdf-eval-note info"><Mail size={14} /> Saving as Selected will send the Second Round email to {team.leader?.email}.</p> : null}
      </div>

      <footer>
        {formError ? <p className="edit-team-form-error" role="alert">{formError}</p> : null}
        <div>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Result"}</button>
        </div>
      </footer>
    </form>
  </div>;
}

export default function AdminPdfSubmissions() {
  const [teams, setTeams] = useState([]);
  const [evaluators, setEvaluators] = useState([]);
  const [panelSize, setPanelSize] = useState(3);
  const [spreadAlert, setSpreadAlert] = useState(20);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [evaluating, setEvaluating] = useState(null);
  const [message, setMessage] = useState("");
  const [retrying, setRetrying] = useState(null);
  const navigate = useNavigate();
  const token = getAdminToken();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const logout = useCallback(() => { clearAdminSession(); navigate("/devleader/login"); }, [navigate]);

  const load = useCallback(({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setLoadError(""); }
    axios.get(`${API_URL}/admin/pdf-submissions`, { headers })
      .then((response) => { setTeams(response.data.teams); setEvaluators(response.data.evaluators || []); setPanelSize(response.data.panelSize || 3); setSpreadAlert(response.data.spreadAlert ?? 20); })
      .catch((error) => { if (error.response?.status === 401) logout(); else if (!silent) setLoadError(error.response?.data?.message || "Unable to load PDF submissions."); })
      .finally(() => { if (!silent) setLoading(false); });
  }, [headers, logout]);

  useEffect(() => { load(); }, [load]);
  // Team Portal edits show up here without a reload. Paused while a dialog is open.
  useAutoRefresh(load, { paused: Boolean(evaluating) });

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
      && (!term || [team.teamName, team.leader?.name, team.leader?.email, team.teamId, team.study?.department, team.study?.year].some((value) => value?.toLowerCase().includes(term))));
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
    setMessage(successMessage || "Result saved.");
  };

  return <main className="admin-teams admin-pdf">
    <header className="admin-teams-header">
      <div><p>DEXATHON 2026 ADMIN</p><h1>PDF Submissions</h1><span>Round 1 PDFs, scored by evaluators on the PPT Evaluation Sheet. Review their scores and publish results.</span></div>
      <nav><AdminNav /></nav>
    </header>

    {message ? <p className="admin-teams-message" role="status">{message}<button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={14} /></button></p> : null}

    <section className="admin-teams-toolbar pdf-toolbar">
      <div className="pdf-filters" role="group" aria-label="Filter by status">
        {["All", ...STATUSES].map((status) => <button type="button" key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status} <span>{counts[status] ?? 0}</span></button>)}
      </div>
      <div className="pdf-toolbar-row">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team name / team head / email" aria-label="Search submissions" />
      </div>
    </section>

    {loading ? <AdminSkeleton rows={4} variant="cards" />
      : loadError ? <div className="admin-teams-state error"><p>{loadError}</p><button type="button" onClick={load}>Retry</button></div>
        : !visibleTeams.length ? <p className="admin-teams-state">{teams.length ? "No teams match this filter." : "No teams yet. Teams appear here once they register."}</p>
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
                <div><dt>Department</dt><dd>{team.study?.department || "—"}</dd></div>
                <div><dt>Year of Study</dt><dd>{team.study?.year || "—"}</dd></div>
                <div><dt>Project Theme</dt><dd>{team.projectTheme || "Not selected"}</dd></div>
                <div><dt>Submitted</dt><dd>{hasPdf ? formatDate(team.pdfSubmission.submittedAt) : "Not yet"}</dd></div>
              </dl>
              <div className="pdf-card-actions">
                <span>PDF</span>
                <button type="button" className="ghost" disabled={!hasPdf} onClick={() => openPdf(team, false)}><Eye size={14} /> View PDF</button>
                <button type="button" className="ghost" disabled={!hasPdf} onClick={() => openPdf(team, true)}><Download size={14} /> Download PDF</button>
              </div>
              <div className="pdf-card-score">
                <div><span>{team.rubric?.complete ? "Final score" : "Score so far"}</span><b>{formatScore(team.rubric?.average)}<small> /100 · {team.rubric?.count || 0}/{team.rubric?.panelSize || panelSize}{team.rubric?.complete ? " ✓" : ""}</small></b></div>
                <div><span>Result</span><b className={`pdf-result-${(team.evaluation?.result || "Pending").toLowerCase().replace(/\s+/g, "-")}`}>{team.evaluation?.result || "Pending"}</b></div>
              </div>
              {team.selectionEmailSent ? <p className="pdf-card-email sent"><Mail size={13} /> Second Round Email Sent · {formatDate(team.selectionEmailSentAt)}</p>
                : team.evaluation?.result === "Selected" && team.selectionEmailStatus === "Failed" ? <div className="pdf-card-email failed"><span>Selection saved, but email could not be sent.</span><button type="button" className="ghost" disabled={retrying === team._id} onClick={() => retryEmail(team)}>{retrying === team._id ? "Sending..." : "Retry Email"}</button></div> : null}
              <footer>
                <span>{team.teamId}</span>
                <button type="button" disabled={!hasPdf} title={!hasPdf ? "No PDF submitted yet" : undefined}
                  onClick={() => { setMessage(""); setEvaluating(team); }}>Review &amp; Result</button>
              </footer>
            </article>;
          })}</section>}
    {!loading && !loadError ? <AdminPagination page={paged.page} pages={paged.pages} total={paged.total} limit={paged.limit} onChange={paged.setPage} label="teams" /> : null}

    {evaluating ? <EvaluateModal team={evaluating} evaluators={evaluators} panelSize={panelSize} spreadAlert={spreadAlert}
      key={(evaluating.panel || []).map((m) => m.id).join("-")}
      onPanelSaved={() => axios.get(`${API_URL}/admin/pdf-submissions`, { headers }).then((r) => { setTeams(r.data.teams); setEvaluating(r.data.teams.find((t) => t._id === evaluating._id) || null); }).catch(() => {})} headers={headers} openPdf={openPdf} onClose={() => setEvaluating(null)} onSaved={handleSaved} /> : null}
  </main>;
}

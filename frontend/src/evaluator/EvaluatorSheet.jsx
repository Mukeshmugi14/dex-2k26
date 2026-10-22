import axios from "axios";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, FileText, Info, Lock, Save, Send, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { API_URL } from "../config/api";
import { clearEvaluatorSession, evaluatorHeaders } from "../config/evaluatorSession";

const marksFor = (max, level) => Math.round(((max * level) / 5) * 10) / 10;
const commentRequired = (id, level) => [0, 1, 5].includes(level) || (id === "C6" && level === 2);
const formatSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const formatDate = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
const emptySheet = () => ({ projectTitle: "", psCategory: "", panel: "", checks: { fileOpens: false, teamIdMatches: false, officialTemplate: false, allSlides: false, missingSlides: "" }, policyFlags: [], policyNote: "", levels: {}, comments: {}, strengths: ["", "", ""], improvements: ["", "", ""], recommendation: "", coiDeclared: false });
const fromServer = (s) => (s ? { ...emptySheet(), ...s, checks: { ...emptySheet().checks, ...(s.checks || {}) }, strengths: [0, 1, 2].map((i) => s.strengths?.[i] || ""), improvements: [0, 1, 2].map((i) => s.improvements?.[i] || "") } : emptySheet());

// Downloads the PDF in parts (the server sends at most 3 MB per request) and returns a blob URL for the viewer.
const loadPdf = async (id, onProgress) => {
  const parts = [];
  let start = 0, size = Infinity;
  while (start < size) {
    const response = await fetch(`${API_URL}/evaluator/teams/${id}/pdf`, { headers: { ...evaluatorHeaders(), Range: `bytes=${start}-` } });
    if (response.status === 401) throw Object.assign(new Error("signed-out"), { status: 401 });
    if (![200, 206].includes(response.status)) throw new Error("pdf");
    const buffer = await response.arrayBuffer();
    parts.push(buffer);
    const range = /\/(\d+)$/.exec(response.headers.get("Content-Range") || "");
    const total = range ? Number(range[1]) : Number(response.headers.get("X-File-Size"));
    // Without a size header, keep reading while full 3 MB parts arrive.
    size = Number.isFinite(total) && total > 0 ? total : (buffer.byteLength >= 3 * 1024 * 1024 ? Infinity : start + buffer.byteLength);
    start += buffer.byteLength;
    onProgress?.(Math.min(100, Math.round((start / size) * 100)));
    if (!buffer.byteLength) break;
  }
  return URL.createObjectURL(new Blob(parts, { type: "application/pdf" }));
};

export default function EvaluatorSheet() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rubric, setRubric] = useState(null);
  const [team, setTeam] = useState(null);
  const [savedStatus, setSavedStatus] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [form, setForm] = useState(emptySheet);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfError, setPdfError] = useState("");
  const pdfRef = useRef("");

  const signedOut = useCallback(() => { clearEvaluatorSession(); navigate("/evaluator/login", { replace: true }); }, [navigate]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      axios.get(`${API_URL}/evaluator/rubric`, { headers: evaluatorHeaders() }),
      axios.get(`${API_URL}/evaluator/teams/${id}`, { headers: evaluatorHeaders() }),
    ]).then(([r, t]) => {
      if (!alive) return;
      setRubric(r.data.rubric); setTeam(t.data.team);
      setForm(fromServer(t.data.sheet)); setSavedStatus(t.data.sheet?.status || null); setSavedAt(t.data.sheet?.updatedAt || null);
    }).catch((e) => { if (e.response?.status === 401) signedOut(); else if (alive) setLoadError(e.response?.data?.message || "Unable to load this team."); });
    loadPdf(id, (p) => alive && setPdfProgress(p))
      .then((url) => { if (alive) { pdfRef.current = url; setPdfUrl(url); } else URL.revokeObjectURL(url); })
      .catch((e) => { if (e.status === 401) signedOut(); else if (alive) setPdfError("The PDF couldn't be loaded. Refresh to try again."); });
    return () => { alive = false; if (pdfRef.current) URL.revokeObjectURL(pdfRef.current); };
  }, [id, signedOut]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const locked = Boolean(team?.locked);
  const update = (patch) => { setForm((f) => ({ ...f, ...(typeof patch === "function" ? patch(f) : patch) })); setDirty(true); setMessage(null); };
  const setLevel = (cid, level) => { update((f) => ({ levels: { ...f.levels, [cid]: level } })); setErrors((e) => ({ ...e, [`level.${cid}`]: "" })); };
  const setComment = (cid, text) => { update((f) => ({ comments: { ...f.comments, [cid]: text } })); setErrors((e) => ({ ...e, [`comment.${cid}`]: "" })); };

  const total = useMemo(() => (rubric ? Math.round(rubric.criteria.reduce((s, c) => s + (Number.isInteger(form.levels[c.id]) ? marksFor(c.max, form.levels[c.id]) : 0), 0) * 10) / 10 : 0), [rubric, form.levels]);
  const scored = rubric ? rubric.criteria.filter((c) => Number.isInteger(form.levels[c.id])).length : 0;

  const validate = () => {
    const next = {};
    for (const c of rubric.criteria) {
      const level = form.levels[c.id];
      if (!Number.isInteger(level)) next[`level.${c.id}`] = "Choose a level.";
      else if (commentRequired(c.id, level) && !String(form.comments[c.id] || "").trim()) next[`comment.${c.id}`] = `A comment is required at level ${level}.`;
    }
    if (!form.recommendation) next.recommendation = "Choose an overall recommendation.";
    if (!form.coiDeclared) next.coiDeclared = "Confirm the declaration.";
    return next;
  };

  const save = async (submit) => {
    if (busy || locked) return;
    if (submit || savedStatus === "submitted") {
      const next = validate();
      setErrors(next);
      if (Object.keys(next).length) {
        setMessage({ tone: "error", text: `Please complete ${Object.keys(next).length} highlighted field${Object.keys(next).length === 1 ? "" : "s"} before submitting.` });
        document.querySelector(`[data-field="${Object.keys(next)[0]}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    setBusy(true); setMessage(null);
    try {
      const { data } = await axios.put(`${API_URL}/evaluator/teams/${id}/evaluation`, { ...form, submit }, { headers: evaluatorHeaders() });
      setSavedStatus(data.sheet.status); setSavedAt(data.sheet.updatedAt); setDirty(false); setErrors({});
      setMessage({ tone: "ok", text: data.message });
    } catch (e) {
      if (e.response?.status === 401) { signedOut(); return; }
      setErrors(e.response?.data?.errors || {});
      setMessage({ tone: "error", text: e.response?.data?.message || "Unable to save. Check your connection and try again." });
    } finally { setBusy(false); }
  };

  if (loadError) return <main className="eval-page"><Link to="/evaluator" className="eval-back"><ArrowLeft size={15} /> All teams</Link><p className="eval-error">{loadError}</p></main>;
  if (!rubric || !team) return <main className="eval-page"><p className="eval-muted">Loading the evaluation sheet…</p></main>;

  const err = (key) => (errors[key] ? <small className="eval-field-error">{errors[key]}</small> : null);
  const ro = locked || busy;

  return <main className="eval-sheet-page">
    <div className="eval-sheet-head">
      <Link to="/evaluator" className="eval-back"><ArrowLeft size={15} /> All teams</Link>
      <div className="eval-sheet-title">
        <span>{team.teamId}</span><h1>{team.teamName}</h1>
        <p>{[team.college, team.theme, team.department, team.year].filter(Boolean).join(" · ")}</p>
      </div>
      <div className={`eval-badge tone-${savedStatus === "submitted" ? "done" : savedStatus === "draft" ? "draft" : "todo"}`}>
        {savedStatus === "submitted" ? <><CheckCircle2 size={14} /> Submitted</> : savedStatus === "draft" ? "Draft saved" : "Not started"}{savedAt ? ` · ${formatDate(savedAt)}` : ""}
      </div>
    </div>
    {locked ? <p className="eval-locked"><Lock size={15} /> The organisers have decided this team's Round 1 result, so this sheet is read-only.</p> : null}

    <div className="eval-split">
      <section className="eval-pdf" aria-label="Team PDF">
        <div className="eval-pdf-bar"><FileText size={15} /> <b title={team.fileName}>{team.fileName}</b><span>{formatSize(team.fileSize)} · submitted {formatDate(team.submittedAt)}</span>
          {pdfUrl ? <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="eval-ghost"><ExternalLink size={14} /> Open in new tab</a> : null}</div>
        {pdfUrl ? <iframe title={`${team.teamName} Round 1 PDF`} src={pdfUrl} /> : <div className="eval-pdf-wait">{pdfError || `Loading PDF… ${pdfProgress}%`}</div>}
      </section>

      <form className="eval-form" onSubmit={(e) => { e.preventDefault(); save(true); }} noValidate>
        <details className="eval-rules"><summary><Info size={15} /> Scoring rules ({rubric.version})</summary>
          <ol>{rubric.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
          <table><tbody>{rubric.levels.map((l) => <tr key={l.level}><td><b>{l.level}</b></td><td>{l.label}</td><td>{l.meaning}</td></tr>)}</tbody></table>
        </details>

        <section className="eval-card eval-team-card" aria-label="Team details">
          <h2 className="eval-card-title"><Users size={16} /> Team details</h2>
          <dl className="eval-team-facts">
            <div><dt>Team ID</dt><dd>{team.teamId}</dd></div>
            <div><dt>Team Head</dt><dd>{team.teamHead || "—"}</dd></div>
            <div><dt>Team size</dt><dd>{team.teamSize} {team.teamSize === 1 ? "person" : "people"}</dd></div>
            <div><dt>Theme</dt><dd>{team.theme || "Not selected"}</dd></div>
            <div><dt>College</dt><dd>{team.crossCollege ? team.colleges.map((c) => `${c.name} (${c.people})`).join(" + ") : team.college || "—"}</dd></div>
            <div><dt>Department · Year</dt><dd>{[team.department, team.year].filter(Boolean).join(" · ") || "—"}</dd></div>
            {team.psCategory ? <div><dt>Prototype type (Round 2)</dt><dd>{team.psCategory}</dd></div> : null}
            <div><dt>Registered</dt><dd>{formatDate(team.registeredAt)}</dd></div>
            <div><dt>PDF submitted</dt><dd>{formatDate(team.submittedAt)}</dd></div>
          </dl>
          <table className="eval-members">
            <thead><tr><th>#</th><th>Name</th><th>College</th><th>Year</th><th>Department</th></tr></thead>
            <tbody>
              {team.teamHead ? <tr><td>1</td><td><b>{team.teamHead}</b><em>Team Head</em></td><td>{team.college || "—"}</td><td>{team.year || "—"}</td><td>{team.department || "—"}</td></tr> : null}
              {team.members.map((m, i) => <tr key={`${m.name}-${i}`}><td>{i + (team.teamHead ? 2 : 1)}</td><td>{m.name}</td><td>{m.college || "—"}</td><td>{m.year || "—"}</td><td>{m.department || "—"}</td></tr>)}
            </tbody>
          </table>
          <p className="eval-panel-note">Scored by a panel of {team.panelSize} evaluators · {team.panelSubmitted} of {team.panelSize} have submitted. The final score is the average of the {team.panelSize} sheets.</p>
        </section>

        <fieldset className="eval-card" disabled={ro}><legend>A. Project details</legend>
          <label className="eval-input"><span>Project title</span><input value={form.projectTitle} onChange={(e) => update({ projectTitle: e.target.value })} maxLength={200} /></label>
          <div className="eval-input"><span>PS category</span><div className="eval-chips">{rubric.psCategories.map((c) => <label key={c} className={form.psCategory === c ? "is-on" : ""}><input type="radio" name="ps" checked={form.psCategory === c} onChange={() => update({ psCategory: c })} /> {c}</label>)}</div></div>
          <label className="eval-input"><span>Panel / room (optional)</span><input value={form.panel} onChange={(e) => update({ panel: e.target.value })} maxLength={100} /></label>
        </fieldset>

        <fieldset className="eval-card" disabled={ro}><legend>B. Submission check</legend>
          <p className="eval-hint">Tick what applies. This doesn't change the score except through C1.</p>
          <div className="eval-checks">{rubric.submissionChecks.map((c) => <label key={c.id}><input type="checkbox" checked={Boolean(form.checks[c.id])} onChange={(e) => update((f) => ({ checks: { ...f.checks, [c.id]: e.target.checked } }))} /> {c.label}</label>)}</div>
          <label className="eval-input"><span>Missing slides</span><input value={form.checks.missingSlides} onChange={(e) => update((f) => ({ checks: { ...f.checks, missingSlides: e.target.value } }))} maxLength={200} placeholder="e.g. Slide 6" /></label>
          <div className="eval-input"><span>Policy flag (refer to organisers, keep scoring)</span>
            <div className="eval-checks">{rubric.policyFlags.map((flag) => <label key={flag}><input type="checkbox" checked={form.policyFlags.includes(flag)} onChange={(e) => update((f) => ({ policyFlags: e.target.checked ? [...f.policyFlags, flag] : f.policyFlags.filter((x) => x !== flag) }))} /> {flag}</label>)}</div></div>
          {form.policyFlags.length ? <label className="eval-input"><span>Policy note</span><input value={form.policyNote} onChange={(e) => update({ policyNote: e.target.value })} maxLength={400} /></label> : null}
        </fieldset>

        <fieldset className="eval-card eval-criteria" disabled={ro}><legend>C. Criterion scores</legend>
          <p className="eval-hint">Choose one level per row. Marks = Max × Level ÷ 5. A comment is required at level 0, 1 or 5 (C6: also level 2).</p>
          {rubric.criteria.map((c) => {
            const level = form.levels[c.id];
            const needComment = Number.isInteger(level) && commentRequired(c.id, level);
            return <div key={c.id} className={`eval-criterion ${errors[`level.${c.id}`] || errors[`comment.${c.id}`] ? "has-error" : ""}`} data-field={`level.${c.id}`}>
              <div className="eval-criterion-head">
                <span className="eval-cid">{c.id}</span>
                <div><b>{c.name}</b><small>{c.check} · slides {c.slides}</small></div>
                <span className="eval-crit-marks">{Number.isInteger(level) ? marksFor(c.max, level) : "–"}<em>/{c.max}</em></span>
              </div>
              <div className="eval-levels" role="radiogroup" aria-label={`${c.id} level`}>
                {[0, 1, 2, 3, 4, 5].map((l) => <button key={l} type="button" role="radio" aria-checked={level === l} className={level === l ? "is-on" : ""} onClick={() => setLevel(c.id, l)}
                  title={rubric.levels.find((x) => x.level === l)?.label}><b>{l}</b><span>{marksFor(c.max, l)}</span></button>)}
              </div>
              {err(`level.${c.id}`)}
              <details className="eval-guide"><summary>What level 5 and level 3 look like</summary><p><b>Level 5:</b> {c.level5}</p><p><b>Level 3:</b> {c.level3}</p></details>
              <label className="eval-input" data-field={`comment.${c.id}`}><span>Evidence comment {needComment ? <em className="eval-req">required</em> : <em>optional</em>}</span>
                <textarea rows={2} value={form.comments[c.id] || ""} onChange={(e) => setComment(c.id, e.target.value)} maxLength={1000} placeholder="Slide no. + what was / was not found" /></label>
              {err(`comment.${c.id}`)}
            </div>;
          })}
        </fieldset>

        <fieldset className="eval-card" disabled={ro}><legend>D. Judge summary</legend>
          <div className="eval-two">
            <div className="eval-input"><span>Major strengths (evidence-based, max 3)</span>{form.strengths.map((v, i) => <input key={i} value={v} placeholder={`${i + 1}.`} maxLength={400} onChange={(e) => update((f) => ({ strengths: f.strengths.map((x, j) => (j === i ? e.target.value : x)) }))} />)}</div>
            <div className="eval-input"><span>Areas for improvement (max 3)</span>{form.improvements.map((v, i) => <input key={i} value={v} placeholder={`${i + 1}.`} maxLength={400} onChange={(e) => update((f) => ({ improvements: f.improvements.map((x, j) => (j === i ? e.target.value : x)) }))} />)}</div>
          </div>
          <div className="eval-input" data-field="recommendation"><span>Overall recommendation (advisory; ranking uses the total score only)</span>
            <div className="eval-chips">{rubric.recommendations.map((r) => <label key={r} className={form.recommendation === r ? "is-on" : ""}><input type="radio" name="rec" checked={form.recommendation === r} onChange={() => { update({ recommendation: r }); setErrors((e) => ({ ...e, recommendation: "" })); }} /> {r}</label>)}</div>
            {err("recommendation")}</div>
          <label className={`eval-declare ${errors.coiDeclared ? "has-error" : ""}`} data-field="coiDeclared"><input type="checkbox" checked={form.coiDeclared} onChange={(e) => { update({ coiDeclared: e.target.checked }); setErrors((x) => ({ ...x, coiDeclared: "" })); }} />
            <span>I declare I have no conflict of interest with this team and scored only from evidence in the submission.</span></label>
          {err("coiDeclared")}
        </fieldset>

        <div className="eval-submitbar">
          <div className="eval-total"><span>Total</span><b>{total}<em> / 100</em></b><small>{scored}/11 criteria scored</small></div>
          {message ? <p className={`eval-msg tone-${message.tone}`} role="status">{message.tone === "error" ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />} {message.text}</p> : null}
          {!locked ? <div className="eval-actions">
            {savedStatus !== "submitted" ? <button type="button" className="eval-ghost" onClick={() => save(false)} disabled={busy}><Save size={15} /> Save draft</button> : null}
            <button type="submit" className="eval-primary" disabled={busy}><Send size={15} /> {busy ? "Saving…" : savedStatus === "submitted" ? "Update submitted sheet" : "Submit evaluation"}</button>
          </div> : null}
        </div>
      </form>
    </div>
  </main>;
}

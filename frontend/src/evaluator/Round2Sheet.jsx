import axios from "axios";
import { AlertTriangle, ArrowLeft, CheckCircle2, Cpu, ExternalLink, Info, Lock, Monitor, Save, Send, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { API_URL } from "../config/api";
import { clearEvaluatorSession, evaluatorHeaders } from "../config/evaluatorSession";

const marksFor = (max, level) => Math.round(((max * level) / 5) * 10) / 10;
const fmt = (v) => (v ? new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
const empty = () => ({ levels: {}, flags: [], remarks: "", recommendation: "", coiDeclared: false });

export default function Round2Sheet() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rubric, setRubric] = useState(null);
  const [team, setTeam] = useState(null);
  const [form, setForm] = useState(empty);
  const [saved, setSaved] = useState({ status: null, at: null });
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showFrame, setShowFrame] = useState(true);

  const signedOut = useCallback(() => { clearEvaluatorSession(); navigate("/evaluator/login", { replace: true }); }, [navigate]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      axios.get(`${API_URL}/evaluator/round2/rubric`, { headers: evaluatorHeaders() }),
      axios.get(`${API_URL}/evaluator/round2/teams/${id}`, { headers: evaluatorHeaders() }),
    ]).then(([r, t]) => {
      if (!alive) return;
      setRubric(r.data.rubric); setTeam(t.data.team);
      setForm(t.data.sheet ? { ...empty(), ...t.data.sheet } : empty());
      setSaved({ status: t.data.sheet?.status || null, at: t.data.sheet?.updatedAt || null });
    }).catch((e) => { if (e.response?.status === 401) signedOut(); else if (alive) setLoadError(e.response?.data?.message || "Unable to load this prototype."); });
    return () => { alive = false; };
  }, [id, signedOut]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const criteria = useMemo(() => (rubric && team ? rubric.criteria[team.prototype.category] || [] : []), [rubric, team]);
  const total = useMemo(() => Math.round(criteria.reduce((s, c) => s + (Number.isInteger(form.levels[c.id]) ? marksFor(c.max, form.levels[c.id]) : 0), 0) * 10) / 10, [criteria, form.levels]);
  const scored = criteria.filter((c) => Number.isInteger(form.levels[c.id])).length;
  const update = (patch) => { setForm((f) => ({ ...f, ...(typeof patch === "function" ? patch(f) : patch) })); setDirty(true); setMessage(null); };

  const save = async (submit) => {
    if (busy || team?.locked) return;
    if (submit || saved.status === "submitted") {
      const next = {};
      criteria.forEach((c) => { if (!Number.isInteger(form.levels[c.id])) next[`level.${c.id}`] = "Choose a level."; });
      if (!form.recommendation) next.recommendation = "Choose a recommendation.";
      if (!form.coiDeclared) next.coiDeclared = "Confirm the declaration.";
      setErrors(next);
      if (Object.keys(next).length) { setMessage({ tone: "error", text: `Please complete ${Object.keys(next).length} highlighted field${Object.keys(next).length === 1 ? "" : "s"}.` }); return; }
    }
    setBusy(true); setMessage(null);
    try {
      const { data } = await axios.put(`${API_URL}/evaluator/round2/teams/${id}/evaluation`, { ...form, submit }, { headers: evaluatorHeaders() });
      setSaved({ status: data.sheet.status, at: data.sheet.updatedAt }); setDirty(false); setErrors({});
      setMessage({ tone: "ok", text: data.message });
    } catch (e) {
      if (e.response?.status === 401) { signedOut(); return; }
      setErrors(e.response?.data?.errors || {});
      setMessage({ tone: "error", text: e.response?.data?.message || "Unable to save. Try again." });
    } finally { setBusy(false); }
  };

  if (loadError) return <main className="eval-page"><Link to="/evaluator/round2" className="eval-back"><ArrowLeft size={15} /> All prototypes</Link><p className="eval-error">{loadError}</p></main>;
  if (!rubric || !team) return <main className="eval-page"><p className="eval-muted">Loading the prototype sheet…</p></main>;

  const p = team.prototype;
  const hardware = p.category === "HARDWARE";
  const openLabel = p.kind === "youtube" ? "Watch on YouTube" : p.kind === "drive" ? "Open in Google Drive" : "Open prototype";
  const ro = team.locked || busy;
  const err = (k) => (errors[k] ? <small className="eval-field-error">{errors[k]}</small> : null);

  return <main className="eval-sheet-page">
    <div className="eval-sheet-head">
      <Link to="/evaluator/round2" className="eval-back"><ArrowLeft size={15} /> All prototypes</Link>
      <div className="eval-sheet-title"><span>{team.teamId}</span><h1>{team.teamName}</h1><p>{[team.college, team.theme].filter(Boolean).join(" · ")}</p></div>
      <div className={`eval-badge tone-type is-${p.category.toLowerCase()}`}>{hardware ? <Cpu size={14} /> : <Monitor size={14} />} {hardware ? "Hardware prototype" : "Software prototype"}</div>
      <div className={`eval-badge tone-${saved.status === "submitted" ? "done" : saved.status === "draft" ? "draft" : "todo"}`}>{saved.status === "submitted" ? <><CheckCircle2 size={14} /> Submitted</> : saved.status === "draft" ? "Draft saved" : "Not started"}{saved.at ? ` · ${fmt(saved.at)}` : ""}</div>
    </div>
    {team.locked ? <p className="eval-locked"><Lock size={15} /> The organisers have decided this team's Round 2 result, so this sheet is read-only.</p> : null}

    <div className="eval-split">
      <section className="eval-pdf" aria-label="Prototype">
        <div className="eval-pdf-bar">{hardware ? <Cpu size={15} /> : <Monitor size={15} />} <b title={p.url}>{p.url}</b><span>submitted {fmt(p.submittedAt)}</span>
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="eval-ghost"><ExternalLink size={14} /> {openLabel}</a></div>
        {p.embedUrl
          ? <><iframe title={`${team.teamName} prototype`} src={p.embedUrl} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            {p.kind === "drive" ? <p className="eval-frame-note"><Info size={13} /> If the Drive preview asks for access, the team didn't share it publicly. Tick the <b>Link / video not working</b> flag.</p> : null}</>
          : p.kind === "website" && showFrame
            ? <><iframe title={`${team.teamName} prototype`} src={p.url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="no-referrer" />
              <p className="eval-frame-note"><Info size={13} /> Some sites don't allow being shown inside another page. If it's blank, use <b>Open prototype</b> (new tab). <button type="button" className="eval-login-link" onClick={() => setShowFrame(false)}>Hide preview</button></p></>
            : <div className="eval-pdf-wait"><a href={p.url} target="_blank" rel="noopener noreferrer" className="eval-primary"><ExternalLink size={15} /> {openLabel} (new tab)</a></div>}
      </section>

      <form className="eval-form" onSubmit={(e) => { e.preventDefault(); save(true); }} noValidate>
        <details className="eval-rules"><summary><Info size={15} /> Scoring rules ({rubric.version})</summary>
          <ol>{rubric.rules.map((r) => <li key={r}>{r}</li>)}</ol>
          <table><tbody>{rubric.levels.map((l) => <tr key={l.level}><td><b>{l.level}</b></td><td>{l.label}</td><td>{l.meaning}</td></tr>)}</tbody></table>
        </details>

        <section className="eval-card eval-team-card" aria-label="Team details">
          <h2 className="eval-card-title"><Users size={16} /> Team</h2>
          <dl className="eval-team-facts">
            <div><dt>Team Head</dt><dd>{team.teamHead || "—"}</dd></div>
            <div><dt>Team size</dt><dd>{team.teamSize}</dd></div>
            <div><dt>Theme</dt><dd>{team.theme || "—"}</dd></div>
            <div><dt>College</dt><dd>{team.colleges.length ? team.colleges.map((c) => `${c.name} (${c.people})`).join(" + ") : team.college || "—"}</dd></div>
            <div><dt>Round 1 score</dt><dd>{team.round1Score ?? "—"} / 100</dd></div>
          </dl>
          <p className="eval-panel-note">Members: {[team.teamHead, ...team.members.map((m) => m.name)].filter(Boolean).join(", ")} · {team.panelSubmitted} of {team.panelSize} evaluators have scored this prototype.</p>
        </section>

        <fieldset className="eval-card eval-criteria" disabled={ro}><legend>{hardware ? "Hardware" : "Software"} prototype criteria</legend>
          <p className="eval-hint">Choose one level per criterion. Marks = Max × Level ÷ 5.</p>
          {criteria.map((c) => {
            const level = form.levels[c.id];
            return <div key={c.id} className={`eval-criterion ${errors[`level.${c.id}`] ? "has-error" : ""}`}>
              <div className="eval-criterion-head">
                <span className="eval-cid">{c.id}</span>
                <div><b>{c.name}</b><small>{c.check}</small></div>
                <span className="eval-crit-marks">{Number.isInteger(level) ? marksFor(c.max, level) : "–"}<em>/{c.max}</em></span>
              </div>
              <div className="eval-levels" role="radiogroup" aria-label={`${c.id} level`}>
                {[0, 1, 2, 3, 4, 5].map((l) => <button key={l} type="button" role="radio" aria-checked={level === l} className={level === l ? "is-on" : ""} title={rubric.levels.find((x) => x.level === l)?.label}
                  onClick={() => { update((f) => ({ levels: { ...f.levels, [c.id]: l } })); setErrors((e) => ({ ...e, [`level.${c.id}`]: "" })); }}><b>{l}</b><span>{marksFor(c.max, l)}</span></button>)}
              </div>
              {err(`level.${c.id}`)}
              <details className="eval-guide"><summary>What level 5 and level 3 look like</summary><p><b>Level 5:</b> {c.level5}</p><p><b>Level 3:</b> {c.level3}</p></details>
            </div>;
          })}
        </fieldset>

        <fieldset className="eval-card" disabled={ro}><legend>Summary</legend>
          <div className="eval-input"><span>Flags (tell the organisers)</span>
            <div className="eval-checks">{rubric.flags.map((f) => <label key={f}><input type="checkbox" checked={form.flags.includes(f)} onChange={(e) => update((x) => ({ flags: e.target.checked ? [...x.flags, f] : x.flags.filter((y) => y !== f) }))} /> {f}</label>)}</div></div>
          <label className="eval-input"><span>Remarks <em>optional</em></span><input value={form.remarks} maxLength={600} onChange={(e) => update({ remarks: e.target.value })} placeholder="Anything the organisers should know" /></label>
          <div className="eval-input"><span>Recommendation (advisory; ranking uses the total score)</span>
            <div className="eval-chips">{rubric.recommendations.map((r) => <label key={r} className={form.recommendation === r ? "is-on" : ""}><input type="radio" name="rec2" checked={form.recommendation === r} onChange={() => { update({ recommendation: r }); setErrors((e) => ({ ...e, recommendation: "" })); }} /> {r}</label>)}</div>
            {err("recommendation")}</div>
          <label className={`eval-declare ${errors.coiDeclared ? "has-error" : ""}`}><input type="checkbox" checked={form.coiDeclared} onChange={(e) => { update({ coiDeclared: e.target.checked }); setErrors((x) => ({ ...x, coiDeclared: "" })); }} />
            <span>I declare I have no conflict of interest with this team and scored only from what the prototype shows.</span></label>
          {err("coiDeclared")}
        </fieldset>

        <div className="eval-submitbar">
          <div className="eval-total"><span>Total</span><b>{total}<em> / 100</em></b><small>{scored}/{criteria.length} criteria scored</small></div>
          {message ? <p className={`eval-msg tone-${message.tone}`} role="status">{message.tone === "error" ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />} {message.text}</p> : null}
          {!team.locked ? <div className="eval-actions">
            {saved.status !== "submitted" ? <button type="button" className="eval-ghost" onClick={() => save(false)} disabled={busy}><Save size={15} /> Save draft</button> : null}
            <button type="submit" className="eval-primary" disabled={busy}><Send size={15} /> {busy ? "Saving…" : saved.status === "submitted" ? "Update submitted sheet" : "Submit evaluation"}</button>
          </div> : null}
        </div>
      </form>
    </div>
  </main>;
}

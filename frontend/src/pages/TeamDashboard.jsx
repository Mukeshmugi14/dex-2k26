import axios from "axios";
import { Check, Circle, Clock3, Cpu, ExternalLink, Eye, FileText, Link2, LogOut, Monitor, RefreshCw, Rocket, Upload, Users, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
const MB = 1024 * 1024;
const MAX_PDF_BYTES = 15 * MB;
const INVALID_PDF_MESSAGE = "Invalid file format. Please upload your Round 1 submission as a PDF only. PPT and PPTX files are not accepted.";
const FILE_TOO_LARGE_MESSAGE = "File size exceeds the 15 MB limit. Please upload a PDF file under 15 MB.";
// Round 2: what each prototype category submits.
const PROTOTYPE_TYPES = {
  SOFTWARE: { label: "Software", title: "SOFTWARE PROTOTYPE", hint: "Website / application link", field: "Website / Prototype URL", placeholder: "https://your-project-url.com", button: "SUBMIT PROTOTYPE →", view: "Open Prototype", help: "Submit your working software prototype as a website / application link.", icon: Monitor },
  HARDWARE: { label: "Hardware", title: "HARDWARE PROTOTYPE VIDEO", hint: "YouTube demo video", field: "YouTube Video Link", placeholder: "https://youtube.com/...", button: "SUBMIT PROTOTYPE VIDEO →", view: "Watch Video", help: "Create and publish a demonstration video of your hardware prototype on YouTube, then submit the video link.", icon: Cpu },
};
const formatDeadline = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
const formatSize = (bytes) => (bytes >= MB / 10 ? `${(bytes / MB).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
// A real PDF starts with "%PDF-"; this catches renamed files before uploading.
const hasPdfSignature = async (file) => {
  try { return new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) === "%PDF-"; } catch { return true; }
};
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

const KEY_DATES = [
  { stage: "OPEN", date: "5 OCT 2026", when: "Monday", event: "Registration Opens", tone: "blue" },
  { stage: "DEADLINE", date: "20 OCT 2026", when: "Tuesday · 11 PM", event: "Round 1 PPT Submission Closes", tone: "orange" },
  { stage: "RESULTS", date: "25 OCT 2026", when: "Sunday · 7 PM", event: "Round 1 Results Announced", tone: "blue" },
  { stage: "DEADLINE", date: "30 OCT 2026", when: "Friday · 11 PM", event: "Round 2 Prototype Closes", tone: "orange" },
  { stage: "RESULTS", date: "2 NOV 2026", when: "Monday · 7 PM", event: "Round 2 Results Announced", tone: "blue" },
  { stage: "FINALE", date: "4–5 NOV 2026", when: "Wed – Thu", event: "Final 24-Hour On-Campus Hackathon", tone: "cyan" },
];

function KeyDates() {
  return <section className="team-key-dates" aria-labelledby="team-key-dates-title">
    <h2 id="team-key-dates-title">KEY COMPETITION DATES</h2>
    <ol className="team-key-dates-grid">
      {KEY_DATES.map((item) => <li className={`team-key-date is-${item.tone}`} key={item.event}>
        <span>{item.stage}</span>
        <strong>{item.date}</strong>
        <em>{item.when}</em>
        <p>{item.event}</p>
      </li>)}
    </ol>
  </section>;
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
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [prototypeType, setPrototypeType] = useState("");
  const [prototypeUrl, setPrototypeUrl] = useState("");
  const [prototypeError, setPrototypeError] = useState("");
  const [prototypeSaving, setPrototypeSaving] = useState(false);
  const [prototypeJustSubmitted, setPrototypeJustSubmitted] = useState(false);
  const fileInputRef = useRef(null);
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

  const choosePdf = async (file) => {
    setPdfError("");
    setSelectedPdf(null);
    if (fileInputRef.current) fileInputRef.current.value = ""; // allow picking the same file again after an error
    if (!file) return;
    if (file.type !== "application/pdf" || !/\.pdf$/i.test(file.name)) return setPdfError(INVALID_PDF_MESSAGE);
    if (file.size > MAX_PDF_BYTES) return setPdfError(FILE_TOO_LARGE_MESSAGE);
    if (!(await hasPdfSignature(file))) return setPdfError(INVALID_PDF_MESSAGE);
    setSelectedPdf(file);
  };

  const uploadPdf = async () => {
    if (!selectedPdf || uploading) return;
    setUploading(true); setUploadProgress(0); setPdfError("");
    try {
      const formData = new FormData();
      formData.append("pdf", selectedPdf);
      await axios.post(`${API_URL}/team/me/pdf`, formData, { headers: { Authorization: `Bearer ${getTeamToken()}` }, onUploadProgress: (event) => { if (event.total) setUploadProgress(Math.round((event.loaded / event.total) * 100)); } });
      setSelectedPdf(null);
      setJustSubmitted(true);
      await load();
    } catch (requestError) {
      if (requestError.response?.status === 401) { logout(); return; }
      if (requestError.response?.status === 409) { setSelectedPdf(null); await load(); }
      setPdfError(requestError.response?.data?.message || "Unable to upload your PDF. Please check your connection and try again.");
    } finally { setUploading(false); }
  };

  const choosePrototypeType = (type) => { setPrototypeType(type); setPrototypeUrl(""); setPrototypeError(""); };

  const submitPrototype = async (event) => {
    event.preventDefault();
    if (prototypeSaving) return;
    if (!prototypeUrl.trim()) { setPrototypeError(`Please enter your ${PROTOTYPE_TYPES[prototypeType].field.toLowerCase()}.`); return; }
    setPrototypeSaving(true); setPrototypeError("");
    try {
      await axios.post(`${API_URL}/team/me/prototype`, { category: prototypeType, url: prototypeUrl.trim() }, { headers: { Authorization: `Bearer ${getTeamToken()}` } });
      setPrototypeJustSubmitted(true);
      setPrototypeUrl("");
      await load();
    } catch (requestError) {
      if (requestError.response?.status === 401) { logout(); return; }
      if ([403, 409].includes(requestError.response?.status)) await load();
      setPrototypeError(requestError.response?.data?.message || "Unable to submit your prototype. Please check your connection and try again.");
    } finally { setPrototypeSaving(false); }
  };

  const header = <header className="team-topbar">
    <div><span className="team-brand">DE<b>X</b>ATHON <em>2026</em></span><small>Team Head Portal</small></div>
    <div className="team-topbar-user">{data ? <span>{data.team.teamHead}</span> : null}<button type="button" onClick={logout}><LogOut size={15} /> Logout</button></div>
  </header>;

  if (!data) return <main className="team-portal team-dash">{header}<div className="team-dash-inner"><p className="team-state">{error || "Loading your team dashboard..."}</p>{error ? <button type="button" className="team-retry" onClick={load}>Retry</button> : null}</div></main>;

  const { team, submission, rounds, current, evaluation, prototype } = data;
  const prototypeInfo = prototype?.category ? PROTOTYPE_TYPES[prototype.category] : null;
  const chosenType = PROTOTYPE_TYPES[prototypeType] || null;
  const prototypeStatus = !prototype ? null : prototype.submitted ? <span className="team-pill ok">✓ Submitted</span> : prototype.open ? <span className="team-pill open">● Submission Open</span> : <span className="team-pill closed">✕ Not Submitted</span>;
  const currentInfo = STATUS[current.status] || STATUS.UPCOMING;
  const notSelected = current.status === "NOT_SELECTED";
  const roundOne = rounds.find((round) => round.number === 1);
  const roundOneInfo = STATUS[roundOne?.status] || STATUS.UPCOMING;

  return <main className="team-portal team-dash">
    {header}
    <div className="team-dash-inner">
      <section className={`team-current ${notSelected ? "is-stopped" : ""}`}>
        <div>
          <span>Current Status</span>
          <h1>Round {current.round}</h1>
        </div>
        <strong className={statusClass(current.status)}>{currentInfo.mark} {currentInfo.label}</strong>
        <TeamRunners count={team.teamSize || ((team.members || []).length + 1)} stopped={notSelected} />
        <button type="button" className="team-refresh" onClick={load} disabled={refreshing} aria-label="Refresh status"><RefreshCw size={15} className={refreshing ? "spin" : ""} /></button>
        {notSelected ? <p className="team-current-message">Thank you for participating in DEXATHON 2026.<br />Your team was not selected for the next round.</p> : null}
      </section>
      {error ? <p className="team-inline-error">{error}</p> : null}

      <KeyDates />

      <div className="team-grid">
        <section className="team-card team-area-details">
          <h2>Team Details</h2>
          <dl className="team-details">
            <div><dt>Team Name</dt><dd>{team.teamName}</dd></div>
            <div><dt>Team Size</dt><dd><b>{team.teamSize || ((team.members || []).length + 1)}</b> ({team.teamHead ? `1 Head + ${(team.members || []).length} Members` : `${(team.members || []).length} Members`})</dd></div>
            <div><dt>Team Head</dt><dd>{team.teamHead}</dd></div>
            <div><dt>Team Head Email</dt><dd className="break">{team.teamHeadEmail}</dd></div>
            {team.teamHeadPhone ? <div><dt>Team Head Phone</dt><dd>{team.teamHeadPhone}</dd></div> : null}
            <div><dt>College</dt><dd>{team.college}</dd></div>
            {team.department || team.year ? (
              <div><dt>Department & Year</dt><dd>{team.department || "—"} {team.year ? `(${team.year})` : ""}</dd></div>
            ) : null}
            <div><dt>Selected Project Theme</dt><dd className="team-theme-value">{team.projectTheme}</dd></div>
            <div><dt>Round 1 Status</dt><dd>{roundOne ? <span className={statusClass(roundOne.status)}>{roundOneInfo.mark} {roundOneInfo.label}</span> : "—"}</dd></div>
            <div><dt>Round 1 PDF Submission Status</dt><dd>{submission.submitted ? <span className="team-pill ok">✓ PDF Submitted</span> : <span className="team-pill open">● Submission Open</span>}</dd></div>
            {prototypeStatus ? <div><dt>Round 2 Prototype Status</dt><dd>{prototypeStatus}</dd></div> : null}
          </dl>
        </section>

        <section className="team-card team-area-members">
          <h2><Users size={17} /> Team Members ({(team.members || []).length})</h2>
          {team.members && team.members.length ? (
            <ol className="team-members">
              {team.members.map((member, index) => {
                const name = typeof member === "string" ? member : member?.name || "Member";
                const college = typeof member === "object" ? member?.college : "";
                const phone = typeof member === "object" ? member?.phone : "";
                return (
                  <li key={index}>
                    <b>{String(index + 1).padStart(2, "0")}.</b>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontWeight: 600 }}>{name}</span>
                      {college || phone ? (
                        <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 400 }}>
                          {college} {phone ? (college ? `• ${phone}` : phone) : ""}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="team-muted">No team members are recorded.</p>
          )}
        </section>

        <section className="team-card team-area-pdf">
          <span className="team-stage-badge is-round1">STAGE 1 · ROUND 1</span>
          <h2><FileText size={17} /> Round 1 PDF Submission</h2>
          <div className="team-template-reference">
            <b>ROUND 1 PPT TEMPLATE</b>
            <strong>Official DEXATHON 2026 Round 1 Presentation Template</strong>
            <p>Download the official PPT template → Prepare your presentation → Convert to PDF → Upload PDF</p>
            <a href="/Dexathon-PPT-Template-2026.pptx" download>Download / View Official Template</a>
          </div>
          {submission.submitted ? <>
            {justSubmitted ? <p className="team-pdf-success" role="status">✓ Round 1 PDF Submitted Successfully</p> : null}
            <div className="team-pdf-file"><FileText size={22} /><div><b>{submission.fileName}</b><span>{submission.fileSize ? `${formatSize(submission.fileSize)} · ` : ""}Submitted {formatDate(submission.submittedAt)}</span></div></div>
            <div className="team-pdf-status"><span>Round 1 PDF Status</span><span className="team-pill ok">✓ PDF Submitted</span></div>
            <button type="button" className="team-action" onClick={viewPdf}><Eye size={16} /> View PDF</button>
            {pdfError ? <p className="team-inline-error">{pdfError}</p> : null}
          </> : <>
            <div className="team-pdf-warning" role="note">
              <span>⚠️ ROUND 1 SUBMISSION — PDF ONLY — MAX 15 MB</span>
              <strong>ROUND 1 — PDF SUBMISSION</strong>
              <b>PDF FORMAT ONLY</b>
              <small>Maximum File Size: 15 MB · PPT / PPTX files are not accepted</small>
            </div>
            <div className="team-pdf-status"><span>Round 1 PDF Status</span><span className="team-pill open">● Submission Open</span></div>
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => choosePdf(event.target.files?.[0])} />
            {selectedPdf ? <div className="team-pdf-file"><FileText size={22} /><div><b>{selectedPdf.name}</b><span>{formatSize(selectedPdf.size)} · Ready to submit</span></div></div> : null}
            {uploading ? <div className="team-upload-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><i style={{ width: `${uploadProgress}%` }} /><span>Uploading… {uploadProgress}%</span></div> : null}
            <div className="team-upload-actions">
              <button type="button" className="team-action" onClick={() => fileInputRef.current?.click()} disabled={uploading}><Upload size={16} /> {selectedPdf ? "Choose Another PDF" : "Choose Round 1 PDF"}</button>
              {selectedPdf ? <button type="button" className="team-action team-upload-action" onClick={uploadPdf} disabled={uploading}><Upload size={16} /> {uploading ? "Submitting…" : "Submit Round 1 PDF"}</button> : null}
            </div>
            {pdfError ? <p className="team-inline-error team-pdf-error" role="alert">{pdfError}</p> : null}
          </>}
          {evaluation ? <div className="team-score"><div><span>Evaluation Score</span><b>{evaluation.totalScore}</b></div><div><span>Result</span><b>{evaluation.result}</b></div></div> : null}
        </section>

        <section className="team-card team-area-round2" aria-labelledby="team-round2-title">
          <span className="team-stage-badge is-round2">STAGE 2 · ROUND 2</span>
          <h2 id="team-round2-title"><Rocket size={17} /> Round 2 — Prototype Submission</h2>
          {!prototype ? <p className="team-muted">Round 2 prototype submission will be available soon.</p>
            : prototype.submitted ? <>
              {prototypeJustSubmitted ? <p className="team-pdf-success" role="status">✓ Round 2 Prototype Submitted Successfully</p> : null}
              <div className="team-r2-heading"><b>ROUND 2 — PROTOTYPE SUBMISSION</b><strong>{prototypeInfo?.title}</strong></div>
              <div className="team-r2-link"><Link2 size={20} /><div><b>{prototypeInfo?.field}</b><a href={prototype.url} target="_blank" rel="noopener noreferrer">{prototype.url}</a><span>Submitted {formatDate(prototype.submittedAt)}</span></div></div>
              <div className="team-pdf-status"><span>Round 2 Prototype Status</span>{prototypeStatus}</div>
              <a className="team-action team-r2-action" href={prototype.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> {prototypeInfo?.view || "Open Link"}</a>
            </>
            : !prototype.open ? <>
              <div className="team-pdf-status"><span>Round 2 Prototype Status</span>{prototypeStatus}</div>
              <p className="team-muted">{prototype.eligible ? `Round 2 prototype submission closed on ${formatDeadline(prototype.deadline)}.` : "Round 2 submission is not available for your team."}</p>
            </>
            : <>
              <p className="team-r2-intro">Choose your prototype type. Submission closes on <b>{formatDeadline(prototype.deadline)}</b>.</p>
              <div className="team-r2-choice" role="radiogroup" aria-label="Prototype type">
                {Object.entries(PROTOTYPE_TYPES).map(([key, type]) => <button type="button" role="radio" aria-checked={prototypeType === key} className={prototypeType === key ? "is-active" : ""} key={key} onClick={() => choosePrototypeType(key)} disabled={prototypeSaving}><type.icon size={20} /><span><b>{type.label.toUpperCase()}</b><small>{type.hint}</small></span></button>)}
              </div>
              {chosenType ? <form className="team-r2-form" onSubmit={submitPrototype} noValidate>
                <div className="team-r2-heading"><b>ROUND 2 — PROTOTYPE SUBMISSION</b><strong>{chosenType.title}</strong><small>{chosenType.help}</small></div>
                <label><span>{chosenType.field}</span><input type="url" inputMode="url" autoComplete="url" placeholder={chosenType.placeholder} value={prototypeUrl} onChange={(event) => { setPrototypeUrl(event.target.value); setPrototypeError(""); }} disabled={prototypeSaving} /></label>
                <button type="submit" className="team-action team-r2-action" disabled={prototypeSaving || !prototypeUrl.trim()}>{prototypeSaving ? "Submitting…" : chosenType.button}</button>
              </form> : null}
              <div className="team-pdf-status"><span>Round 2 Prototype Status</span>{prototypeStatus}</div>
              {prototypeError ? <p className="team-inline-error team-pdf-error" role="alert">{prototypeError}</p> : null}
            </>}
        </section>

        <section className="team-card team-area-progress">
          <h2>Round Progress</h2>
          <RoundTracker rounds={rounds} />
        </section>
      </div>
    </div>
  </main>;
}

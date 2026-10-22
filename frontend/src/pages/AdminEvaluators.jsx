import axios from "axios";
import { ExternalLink, KeyRound, Mail, Shuffle, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminTeams.css";
import "./AdminPdfSubmissions.css";
import "./AdminUsers.css";
import { API_URL } from "../config/api";
import AdminNav from "../components/AdminNav";
import { AdminSkeleton } from "../components/AdminListParts";
import { clearAdminSession, getAdminToken } from "../config/adminSession";

const formatDate = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never");

// Admin → Evaluators: who can sign in to the Evaluator Portal (hosted). Evaluators set their own password
// after a one-time code emailed to them; admins never see it.
export default function AdminEvaluators() {
  const [evaluators, setEvaluators] = useState([]);
  const [portalUrl, setPortalUrl] = useState("");
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", email: "", sendInvite: true });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState("");
  const navigate = useNavigate();
  const token = getAdminToken();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const signOut = useCallback(() => { clearAdminSession(); navigate("/devleader/login"); }, [navigate]);

  const load = useCallback(() => {
    setLoading(true); setLoadError("");
    axios.get(`${API_URL}/admin/evaluators`, { headers })
      .then((r) => { setEvaluators(r.data.evaluators); setPortalUrl(r.data.portalUrl); setCoverage(r.data.coverage); })
      .catch((e) => { if (e.response?.status === 401) signOut(); else setLoadError(e.response?.data?.message || "Unable to load evaluators."); })
      .finally(() => setLoading(false));
  }, [headers, signOut]);
  useEffect(load, [load]);

  const act = async (key, request, done) => {
    setBusy(key); setMessage("");
    try { const r = await request(); setMessage(r.data.message); done?.(r); load(); }
    catch (e) { if (e.response?.status === 401) { signOut(); return; } setErrors(e.response?.data?.errors || {}); setMessage(e.response?.data?.message || "Something went wrong. Try again."); }
    finally { setBusy(""); }
  };
  const add = (event) => {
    event.preventDefault();
    act("add", () => axios.post(`${API_URL}/admin/evaluators`, { ...form, email: form.email.trim().toLowerCase(), name: form.name.trim() }, { headers }), () => { setForm({ name: "", email: "", sendInvite: form.sendInvite }); setErrors({}); });
  };

  return <main className="admin-teams admin-pdf admin-users">
    <header className="admin-teams-header">
      <div><p>DEXATHON 2026 ADMIN</p><h1>Evaluators</h1><span>Judges who score Round 1 PPTs in the Evaluator Portal{portalUrl ? <> · <a href={portalUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#55caff" }}>{portalUrl} <ExternalLink size={12} /></a></> : null}</span></div>
      <nav><AdminNav /></nav>
    </header>
    {message ? <p className="admin-teams-message" role="status">{message}<button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={14} /></button></p> : null}

    <form className="team-card au-create" onSubmit={add} noValidate>
      <h2><UserPlus size={18} /> Add Evaluator</h2>
      <div className="au-grid">
        <label className={errors.name ? "has-error" : ""}><span>Name</span><input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: "" }); }} placeholder="e.g. Dr. A. Kumar" />{errors.name ? <small>{errors.name}</small> : null}</label>
        <label className={errors.email ? "has-error" : ""}><span>Email</span><input type="email" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setErrors({ ...errors, email: "" }); }} placeholder="evaluator@example.com" autoComplete="off" />{errors.email ? <small>{errors.email}</small> : null}</label>
        <label style={{ alignSelf: "end" }}><span>Invitation</span><span style={{ display: "flex", alignItems: "center", gap: 8, color: "#c9d6ea", font: "13px Arial, sans-serif", letterSpacing: 0, textTransform: "none" }}><input type="checkbox" style={{ width: 16, height: 16 }} checked={form.sendInvite} onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })} /> Email the portal link now</span></label>
      </div>
      <footer><span>They sign in with this email: the first time with a one-time code sent to it, then with the password they choose.</span><button type="submit" disabled={busy === "add"}>{busy === "add" ? "Adding..." : "Add Evaluator"}</button></footer>
    </form>

    {coverage ? <section className="team-card au-create ev-panels">
      <h2><Shuffle size={18} /> Round 1 panels · {coverage.panelSize} evaluators per PPT</h2>
      <div className="ev-coverage">
        <div><span>PPTs submitted</span><b>{coverage.teams}</b></div>
        <div><span>Full panels ({coverage.panelSize} evaluators)</span><b>{coverage.fullPanels}</b></div>
        <div><span>No panel yet</span><b>{coverage.unassigned}</b></div>
        <div><span>Final scores ({coverage.panelSize}/{coverage.panelSize} sheets)</span><b>{coverage.finalScores}</b></div>
      </div>
      <footer><span>Assigns every PPT to {coverage.panelSize} different active evaluators, spreading them evenly. Running it again only fills gaps (new PDFs, disabled evaluators); nobody loses teams they've started. Add all evaluators first.</span>
        <button type="button" disabled={Boolean(busy) || evaluators.filter((e) => e.active).length < coverage.panelSize} title={evaluators.filter((e) => e.active).length < coverage.panelSize ? `Needs at least ${coverage.panelSize} active evaluators` : undefined}
          onClick={() => act("assign", () => axios.post(`${API_URL}/admin/evaluators/assign-panels`, {}, { headers }))}>{busy === "assign" ? "Assigning..." : coverage.unassigned || coverage.fullPanels < coverage.teams ? "Assign panels" : "Re-check panels"}</button></footer>
    </section> : null}

    {loading ? <AdminSkeleton rows={3} variant="cards" />
      : loadError ? <div className="admin-teams-state error"><p>{loadError}</p><button type="button" onClick={load}>Retry</button></div>
        : !evaluators.length ? <p className="admin-teams-state">No evaluators yet. Add the first one above.</p>
          : <section className="team-card-grid pdf-card-grid au-list">{evaluators.map((ev) => <article key={ev.id} className={`team-card au-card ${ev.active ? "" : "is-disabled"}`}>
            <div className="pdf-card-head"><h2>{ev.name || ev.email}</h2><span className={`au-role ${ev.passwordSet ? "au-role-super_admin" : "au-role-pdf_admin"}`}>{!ev.active ? "Disabled" : ev.passwordSet ? "Active" : "Invited"}</span></div>
            <dl className="pdf-card-details">
              <div><dt>Email</dt><dd className="break">{ev.email}</dd></div>
              <div><dt>Password</dt><dd>{ev.passwordSet ? `Set ${formatDate(ev.passwordSetAt)}` : "Not set yet (first sign-in pending)"}</dd></div>
              <div><dt>Last sign-in</dt><dd>{formatDate(ev.lastLoginAt)}</dd></div>
              <div><dt>Assigned PPTs</dt><dd>{ev.assigned}</dd></div>
              <div><dt>Sheets</dt><dd>{ev.submitted} submitted · {ev.drafts} draft{ev.drafts === 1 ? "" : "s"}{ev.assigned ? ` · ${Math.max(0, ev.assigned - ev.submitted)} left` : ""}</dd></div>
            </dl>
            <footer>
              {ev.active ? <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => act(`inv-${ev.id}`, () => axios.post(`${API_URL}/admin/evaluators/${ev.id}/invite`, {}, { headers }))}><Mail size={14} /> {busy === `inv-${ev.id}` ? "Sending..." : "Resend invite"}</button> : null}
              {ev.passwordSet ? <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`Reset ${ev.email}'s password? They will need a new one-time code to sign in.`)) act(`rst-${ev.id}`, () => axios.post(`${API_URL}/admin/evaluators/${ev.id}/reset-password`, {}, { headers })); }}><KeyRound size={14} /> Reset password</button> : null}
              <button type="button" className={ev.active ? "tm-danger" : "ghost"} disabled={Boolean(busy)} onClick={() => act(`act-${ev.id}`, () => axios.put(`${API_URL}/admin/evaluators/${ev.id}`, { active: !ev.active }, { headers }))}>{ev.active ? "Disable" : "Enable"}</button>
            </footer>
          </article>)}</section>}
  </main>;
}

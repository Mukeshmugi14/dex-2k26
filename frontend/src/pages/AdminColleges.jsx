import axios from "axios";
import { AlertTriangle, CheckCircle2, GitMerge, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminDashboard.css";
import "./AdminColleges.css";
import { API_URL } from "../config/api";
import { clearAdminSession, getAdminToken } from "../config/adminSession";
import AdminNav from "../components/AdminNav";

const SERVER_DOWN = "Can't reach the backend server. Start it in a terminal with: npm --prefix backend run dev — then try again.";
const fmtTime = (value) => (value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "");
const STATUS_LABEL = { review: "Needs review", unresolved: "Unresolved", empty: "No college given", matched: "Matched", confirmed: "Confirmed by admin" };

// Admin → Colleges: review uncertain matches, maintain the college registry (aliases, merges), reprocess, audit.
export default function AdminColleges() {
  const [tab, setTab] = useState("review");
  const [registry, setRegistry] = useState(null);
  const [review, setReview] = useState(null);
  const [auditLog, setAuditLog] = useState(null);
  const [message, setMessage] = useState(null); // { type, text }
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const token = getAdminToken();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fail = useCallback((error, fallback) => {
    if (error.response?.status === 401) { clearAdminSession(); navigate("/devleader/login"); return; }
    setMessage({ type: "error", text: !error.response ? SERVER_DOWN : error.response.data?.message || fallback });
  }, [navigate]);

  const load = useCallback(async () => {
    try {
      const [r, q, a] = await Promise.all([
        axios.get(`${API_URL}/admin/colleges/registry`, { headers }),
        axios.get(`${API_URL}/admin/colleges/review`, { headers }),
        axios.get(`${API_URL}/admin/colleges/audit?limit=60`, { headers }),
      ]);
      setRegistry(r.data); setReview(q.data.items); setAuditLog(a.data.entries);
    } catch (error) { fail(error, "Unable to load the college registry."); }
  }, [headers, fail]);
  useEffect(() => { load(); }, [load]);

  // Runs an admin action; a 409 conflict can be confirmed (e.g. moving an alias) and retried with extra fields.
  const act = async (request, { confirmConflict } = {}) => {
    setBusy(true); setMessage(null);
    try {
      const response = await request({});
      setMessage({ type: "ok", text: response.data.message || "Saved." });
      await load();
      return true;
    } catch (error) {
      if (error.response?.status === 409 && confirmConflict && window.confirm(`${error.response.data.message}\n\nConfirm to continue.`)) {
        try { const response = await request(confirmConflict); setMessage({ type: "ok", text: response.data.message || "Saved." }); await load(); return true; } catch (retryError) { fail(retryError, "Action failed."); }
      } else fail(error, "Action failed.");
      return false;
    } finally { setBusy(false); }
  };

  const colleges = (registry?.colleges || []).filter((c) => c.active);
  const options = colleges.map((c) => ({ id: c.collegeId, name: c.name }));
  const filtered = colleges.filter((c) => {
    const term = search.trim().toLowerCase();
    return !term || [c.collegeId, c.name, ...c.cities, ...c.aliases.map((a) => a.alias), ...c.variants.map((v) => v.raw)].some((v) => String(v).toLowerCase().includes(term));
  });

  return <main className="admin-dashboard admin-colleges">
    <header>
      <h1>Colleges</h1>
      <nav><AdminNav /></nav>
    </header>
    <p className="col-intro">Each registration keeps the college name exactly as submitted and is linked to one registry college. Analytics, filters and exports group by that college. Uncertain or unknown names wait here for review instead of being guessed.</p>

    <div className="col-tabs" role="tablist">
      {[["review", `Review queue (${review?.length ?? "…"})`], ["registry", `Registry (${colleges.length})`], ["audit", "Audit log"]].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}
      <button type="button" className="col-reprocess" disabled={busy} onClick={() => window.confirm("Re-run matching for every registration? Admin-confirmed mappings are kept.") && act(() => axios.post(`${API_URL}/admin/colleges/reprocess`, { apply: true }, { headers }))}><RefreshCw size={14} /> Reprocess all registrations</button>
    </div>
    {message ? <p className={`col-message is-${message.type}`} role="status">{message.type === "ok" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {message.text}</p> : null}

    {!registry ? <p className="col-empty">Loading…</p> : tab === "review" ? <ReviewQueue items={review} options={options} busy={busy} act={act} headers={headers} />
      : tab === "registry" ? <>
        <div className="col-toolbar">
          <label className="col-search"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, ID, alias, city or submitted spelling" aria-label="Search colleges" /></label>
          <NewCollege busy={busy} act={act} headers={headers} />
        </div>
        <ul className="col-list">{filtered.map((c) => <CollegeCard key={c.collegeId} college={c} options={options} busy={busy} act={act} headers={headers} />)}</ul>
        {registry.colleges.some((c) => !c.active) ? <p className="col-muted">Merged (kept for history): {registry.colleges.filter((c) => !c.active).map((c) => `${c.name} → ${c.mergedInto}`).join(" · ")}</p> : null}
      </> : <AuditLog entries={auditLog} />}
  </main>;
}

function ReviewQueue({ items, options, busy, act, headers }) {
  if (!items?.length) return <p className="col-empty"><CheckCircle2 size={16} /> Every registration is linked to a college.</p>;
  return <ul className="col-review">{items.map((item) => <ReviewItem key={item.id} item={item} options={options} busy={busy} act={act} headers={headers} />)}</ul>;
}

function ReviewItem({ item, options, busy, act, headers }) {
  const [choice, setChoice] = useState(item.candidates[0]?.collegeId || "");
  const [remember, setRemember] = useState(true);
  const [newName, setNewName] = useState("");
  const resolve = (body) => act((extra) => axios.post(`${API_URL}/admin/colleges/resolve`, { registrationId: item.id, ...body, ...extra }, { headers }), { confirmConflict: { move: true } });
  return <li className="col-review-item">
    <div className="col-review-head">
      <b>{item.teamId}</b> <span>{item.teamName}</span>
      <em className={`col-status is-${item.status}`}>{STATUS_LABEL[item.status] || item.status}</em>
    </div>
    <p className="col-raw">Submitted: <q>{item.raw || "—"}</q>{item.note ? <small> · {item.note}</small> : null}</p>
    {item.candidates.length ? <p className="col-candidates">Suggestions: {item.candidates.map((c) => <button type="button" key={c.collegeId} className={choice === c.collegeId ? "active" : ""} onClick={() => setChoice(c.collegeId)}>{c.name} <small>{Math.round(c.score * 100)}%</small></button>)}</p> : null}
    <div className="col-review-actions">
      <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="College">
        <option value="">Choose a college…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <label className="col-check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember this spelling</label>
      <button type="button" disabled={busy || !choice} onClick={() => resolve({ collegeId: choice, rememberAlias: remember })}><CheckCircle2 size={14} /> Assign</button>
    </div>
    <div className="col-review-actions">
      <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`New college's official name (e.g. ${item.raw ? item.raw.slice(0, 40) : "…"})`} aria-label="New college name" />
      <button type="button" className="secondary" disabled={busy || !newName.trim()} onClick={() => resolve({ createCollege: { name: newName }, rememberAlias: true })}><Plus size={14} /> Create college & assign</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => resolve({ collegeId: null, note: "Left unresolved by admin" })}>Leave unresolved</button>
    </div>
  </li>;
}

function NewCollege({ busy, act, headers }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cities, setCities] = useState("");
  if (!open) return <button type="button" className="col-add" onClick={() => setOpen(true)}><Plus size={14} /> Add college</button>;
  return <form className="col-inline-form" onSubmit={async (e) => { e.preventDefault(); if (await act(() => axios.post(`${API_URL}/admin/colleges`, { name, cities }, { headers }))) { setOpen(false); setName(""); setCities(""); } }}>
    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Official name" aria-label="Official name" required />
    <input value={cities} onChange={(e) => setCities(e.target.value)} placeholder="Cities / campuses (comma separated)" aria-label="Cities" />
    <button type="submit" disabled={busy || !name.trim()}>Add</button>
    <button type="button" className="secondary" onClick={() => setOpen(false)}><X size={14} /></button>
  </form>;
}

function CollegeCard({ college, options, busy, act, headers }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(college.name);
  const [cities, setCities] = useState(college.cities.join(", "));
  const [alias, setAlias] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const base = `${API_URL}/admin/colleges/${encodeURIComponent(college.collegeId)}`;
  return <li className="col-card">
    <div className="col-card-head">
      {editing ? <form className="col-inline-form" onSubmit={async (e) => { e.preventDefault(); if (await act(() => axios.put(base, { name, cities }, { headers }))) setEditing(false); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Official name" required />
        <input value={cities} onChange={(e) => setCities(e.target.value)} aria-label="Cities" placeholder="Cities / campuses" />
        <button type="submit" disabled={busy}>Save</button>
        <button type="button" className="secondary" onClick={() => setEditing(false)}><X size={14} /></button>
      </form> : <>
        <h2>{college.name}</h2>
        <button type="button" className="col-icon" onClick={() => setEditing(true)} aria-label={`Edit ${college.name}`}><Pencil size={14} /></button>
      </>}
    </div>
    <p className="col-meta"><code>{college.collegeId}</code> · {college.teams} team{college.teams === 1 ? "" : "s"}{college.cities.length ? ` · ${college.cities.join(", ")}` : ""}{college.source === "seed" ? " · starting registry" : ""}</p>
    <div className="col-aliases">
      {college.aliases.map((a) => <span key={a.id} className={`col-alias ${a.verified ? "" : "is-unverified"}`}>
        {a.verified ? <ShieldCheck size={12} aria-label="Verified" /> : null}{a.alias}
        {!a.verified ? <button type="button" disabled={busy} onClick={() => act(() => axios.put(`${base}/aliases/${a.id}`, { verified: true }, { headers }))}>verify</button> : null}
        <button type="button" disabled={busy} aria-label={`Remove alias ${a.alias}`} onClick={() => window.confirm(`Remove the alias "${a.alias}"?`) && act(() => axios.delete(`${base}/aliases/${a.id}`, { headers }))}><Trash2 size={11} /></button>
      </span>)}
      <form className="col-alias-add" onSubmit={async (e) => { e.preventDefault(); if (await act((extra) => axios.post(`${base}/aliases`, { alias, verified: true, ...extra }, { headers }), { confirmConflict: { move: true } })) setAlias(""); }}>
        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Add alias / short name" aria-label="New alias" />
        <button type="submit" disabled={busy || !alias.trim()}><Plus size={12} /></button>
      </form>
    </div>
    {college.variants.length ? <details className="col-variants"><summary>Submitted spellings ({college.variants.length})</summary><ul>{college.variants.map((v) => <li key={v.raw}><q>{v.raw}</q> <small>× {v.count}</small></li>)}</ul></details> : null}
    <div className="col-merge">
      <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} aria-label="Merge into">
        <option value="">Merge into another college…</option>
        {options.filter((o) => o.id !== college.collegeId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <button type="button" className="secondary" disabled={busy || !mergeInto} onClick={() => window.confirm(`Merge "${college.name}" into "${options.find((o) => o.id === mergeInto)?.name}"? Its registrations and aliases move there; the original names and registration data are kept.`) && act(() => axios.post(`${base}/merge`, { intoCollegeId: mergeInto }, { headers }))}><GitMerge size={14} /> Merge</button>
    </div>
  </li>;
}

function AuditLog({ entries }) {
  if (!entries?.length) return <p className="col-empty">No changes recorded yet.</p>;
  return <div className="col-table-scroll"><table className="col-audit">
    <thead><tr><th>When</th><th>Action</th><th>By</th><th>College</th><th>Details</th></tr></thead>
    <tbody>{entries.map((e) => <tr key={e._id}><td>{fmtTime(e.createdAt)}</td><td>{e.action}</td><td>{e.actor}</td><td>{e.collegeId || ""}{e.teamId ? ` · ${e.teamId}` : ""}</td><td>{e.note || (e.after?.raw ? `“${e.after.raw}”` : e.after?.alias ? `“${e.after.alias}”` : "")}</td></tr>)}</tbody>
  </table></div>;
}

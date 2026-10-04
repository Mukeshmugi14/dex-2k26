import axios from "axios";
import { KeyRound, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminTeams.css";
import "./AdminUsers.css";
import { API_URL } from "../config/api";
import AdminNav from "../components/AdminNav";
import { AdminSkeleton } from "../components/AdminListParts";
import { clearAdminSession, getAdminProfile, getAdminToken, ROLE_LABELS } from "../config/adminSession";

const ROLE_HELP = {
  SUPER_ADMIN: "Full access to every section",
  PAYMENT_ADMIN: "Payment History, confirmation & Payment Settings",
  TEAM_ADMIN: "Dashboard, registrations & teams",
  ROUND_ADMIN: "Round Status & Round Selection",
  PDF_ADMIN: "PDF submissions & evaluation",
};
const formatDate = (value) => (value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never");

function CreateAdminForm({ roles, headers, onCreated, onUnauthorized }) {
  const [form, setForm] = useState({ username: "", name: "", role: "PAYMENT_ADMIN", password: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await axios.post(`${API_URL}/admin/users`, { ...form, username: form.username.trim().toLowerCase() }, { headers });
      onCreated(response.data.admin, response.data.message);
      setForm({ username: "", name: "", role: form.role, password: "" });
      setErrors({});
    } catch (requestError) {
      if (requestError.response?.status === 401) { onUnauthorized(); return; }
      setErrors(requestError.response?.data?.errors || {});
      setError(requestError.response?.data?.message || "Unable to create the admin. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return <form className="team-card au-create" onSubmit={submit} noValidate>
    <h2><UserPlus size={18} /> Create Admin Login</h2>
    <div className="au-grid">
      <label className={errors.username ? "has-error" : ""}><span>Username</span><input value={form.username} onChange={(event) => update("username", event.target.value)} autoComplete="off" placeholder="e.g. payments.desk" />{errors.username ? <small>{errors.username}</small> : null}</label>
      <label><span>Name (optional)</span><input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Person's name" /></label>
      <label className={errors.role ? "has-error" : ""}><span>Role</span><select value={form.role} onChange={(event) => update("role", event.target.value)}>{roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select><small className="au-hint">{ROLE_HELP[form.role]}</small></label>
      <label className={errors.password ? "has-error" : ""}><span>Password</span><input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />{errors.password ? <small>{errors.password}</small> : null}</label>
    </div>
    {error ? <p className="pdf-error" role="alert">{error}</p> : null}
    <footer><span>Share the username and password with the person privately.</span><button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Admin"}</button></footer>
  </form>;
}

function AdminCard({ admin, roles, isSelf, headers, onUpdated, onDelete, onUnauthorized }) {
  const [role, setRole] = useState(admin.role);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { setRole(admin.role); }, [admin.role]);

  const save = async (changes) => {
    setSaving(true);
    setNote("");
    try {
      const response = await axios.put(`${API_URL}/admin/users/${admin.id}`, changes, { headers });
      onUpdated(response.data.admin, `${admin.username}: ${response.data.message}`);
      setNewPassword("");
    } catch (requestError) {
      if (requestError.response?.status === 401) { onUnauthorized(); return; }
      setNote(requestError.response?.data?.message || "Unable to update. Please try again.");
      setRole(admin.role);
    } finally {
      setSaving(false);
    }
  };

  return <article className={`team-card au-card ${admin.active ? "" : "is-disabled"}`}>
    <div className="pdf-card-head"><h2>{admin.username}{isSelf ? <em> (you)</em> : null}</h2><span className={`au-role au-role-${admin.role.toLowerCase()}`}>{ROLE_LABELS[admin.role]}</span></div>
    <dl className="pdf-card-details">
      <div><dt>Name</dt><dd>{admin.name || "—"}</dd></div>
      <div><dt>Access</dt><dd>{ROLE_HELP[admin.role]}</dd></div>
      <div><dt>Status</dt><dd>{admin.active ? "Active" : "Disabled"}</dd></div>
      <div><dt>Last login</dt><dd>{formatDate(admin.lastLoginAt)}</dd></div>
    </dl>
    <div className="au-controls">
      <label><span>Role</span>
        <select value={role} disabled={saving || isSelf} onChange={(event) => { setRole(event.target.value); save({ role: event.target.value }); }}>
          {roles.map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
        </select>
      </label>
      <form className="au-password" onSubmit={(event) => { event.preventDefault(); if (newPassword) save({ password: newPassword }); }}>
        <label><span>Reset password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" disabled={saving} /></label>
        <button type="submit" className="ghost" disabled={saving || newPassword.length < 8}><KeyRound size={14} /> Reset</button>
      </form>
    </div>
    {note ? <p className="pdf-error" role="alert">{note}</p> : null}
    <footer>
      <button type="button" className="ghost" disabled={saving || isSelf} onClick={() => save({ active: !admin.active })}>{admin.active ? "Disable login" : "Enable login"}</button>
      <button type="button" className="tm-danger" disabled={saving || isSelf} onClick={() => onDelete(admin)}><Trash2 size={14} /> Delete</button>
    </footer>
  </article>;
}

export default function AdminUsers() {
  const [admins, setAdmins] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const token = getAdminToken();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const selfId = getAdminProfile()?.id;

  const signOut = useCallback(() => { clearAdminSession(); navigate("/admin/login"); }, [navigate]);
  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    axios.get(`${API_URL}/admin/users`, { headers })
      .then((response) => { setAdmins(response.data.admins); setRoles(response.data.roles); })
      .catch((error) => { if (error.response?.status === 401) signOut(); else setLoadError(error.response?.data?.message || "Unable to load admin users."); })
      .finally(() => setLoading(false));
  }, [headers, signOut]);
  useEffect(load, [load]);

  const replace = (admin, text) => { setAdmins((current) => current.map((item) => (item.id === admin.id ? admin : item))); if (text) setMessage(text); };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const response = await axios.delete(`${API_URL}/admin/users/${deleting.id}`, { headers });
      setAdmins((current) => current.filter((item) => item.id !== deleting.id));
      setMessage(`${deleting.username}: ${response.data.message}`);
      setDeleting(null);
    } catch (error) {
      if (error.response?.status === 401) { signOut(); return; }
      setMessage(error.response?.data?.message || "Unable to delete. Please try again.");
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  return <main className="admin-teams admin-pdf admin-users">
    <header className="admin-teams-header">
      <div><p>DEXATHON 2026 ADMIN</p><h1>Admin Users</h1><span>Create separate logins and choose which section each one can use.</span></div>
      <nav><AdminNav /></nav>
    </header>
    {message ? <p className="admin-teams-message" role="status">{message}<button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={14} /></button></p> : null}

    {roles.length ? <CreateAdminForm roles={roles} headers={headers} onUnauthorized={signOut} onCreated={(admin, text) => { setAdmins((current) => [...current, admin]); setMessage(text); }} /> : null}

    {loading ? <AdminSkeleton rows={3} variant="cards" />
      : loadError ? <div className="admin-teams-state error"><p>{loadError}</p><button type="button" onClick={load}>Retry</button></div>
        : <section className="team-card-grid pdf-card-grid au-list">{admins.map((admin) => <AdminCard key={admin.id} admin={admin} roles={roles} isSelf={admin.id === selfId} headers={headers} onUpdated={replace} onDelete={setDeleting} onUnauthorized={signOut} />)}</section>}

    {deleting ? <div className="edit-team-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDeleting(null); }}>
      <section className="edit-team-modal tm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="au-delete-title">
        <header><div><span>Permanent action</span><h2 id="au-delete-title">Delete admin login?</h2></div></header>
        <div className="edit-team-body"><p className="tm-delete-text"><b>{deleting.username}</b> ({ROLE_LABELS[deleting.role]}) will no longer be able to sign in.</p></div>
        <footer><div>
          <button type="button" className="ghost" onClick={() => setDeleting(null)} disabled={busy}>Cancel</button>
          <button type="button" className="tm-danger" onClick={confirmDelete} disabled={busy} autoFocus>{busy ? "Deleting..." : "Delete Admin"}</button>
        </div></footer>
      </section>
    </div> : null}
  </main>;
}

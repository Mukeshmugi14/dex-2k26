import axios from "axios";
import { ImageUp, Pencil, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AdminTeams.css";
import { API_URL } from "../config/api";
import { resizeLogo } from "../utils/resizeLogo";

const isEmail = (value) => /^\S+@\S+\.\S+$/.test(value);
const pad = (index) => String(index + 1).padStart(2, "0");

const toForm = (team) => ({
  teamName: team.teamName || "",
  leaderName: team.leader?.name || "",
  leaderEmail: team.leader?.email || "",
  leaderPhone: team.leader?.phone || "",
  members: team.members.map((member) => member.name || ""),
});

const validate = (form) => {
  const errors = {};
  if (!form.teamName.trim()) errors.teamName = "Team name is required.";
  if (!form.leaderName.trim()) errors.leaderName = "Team head name is required.";
  if (!isEmail(form.leaderEmail.trim())) errors.leaderEmail = "Enter a valid email address.";
  if (!form.leaderPhone.trim()) errors.leaderPhone = "Phone number is required.";
  form.members.forEach((name, index) => { if (!name.trim()) errors[`member-${index}`] = "Member name is required."; });
  return errors;
};

function Field({ label, error, children }) {
  return <label className={`edit-team-field ${error ? "has-error" : ""}`}><span>{label}</span>{children}{error ? <small>{error}</small> : null}</label>;
}

function EditTeamModal({ team, headers, onClose, onSaved }) {
  const [form, setForm] = useState(() => toForm(team));
  const [logo, setLogo] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const firstFieldRef = useRef(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); };
  const updateMember = (index, value) => {
    setForm((current) => ({ ...current, members: current.members.map((name, memberIndex) => (memberIndex === index ? value : name)) }));
    setErrors((current) => ({ ...current, [`member-${index}`]: "" }));
  };
  const chooseLogo = (file) => {
    if (!file) return;
    if (!/image\/(png|jpeg)/.test(file.type) || file.size > 2 * 1024 * 1024) { setErrors((current) => ({ ...current, logo: "Choose a PNG or JPG image up to 2 MB." })); return; }
    resizeLogo(file)
      .then((src) => { setLogo({ name: file.name, src }); setErrors((current) => ({ ...current, logo: "" })); })
      .catch(() => setErrors((current) => ({ ...current, logo: "That image could not be read." })));
  };

  const save = async (event) => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length) { setFormError("Please correct the highlighted fields."); return; }
    setSaving(true);
    try {
      const members = form.members.map((name) => ({ name: name.trim() }));
      const response = await axios.put(`${API_URL}/admin/registrations/${team._id}`, {
        teamName: form.teamName.trim(),
        leader: { name: form.leaderName.trim(), email: form.leaderEmail.trim(), phone: form.leaderPhone.trim() },
        members,
        ...(logo ? { logo: logo.src } : {}),
      }, { headers });
      onSaved(response.data.registration, response.data.message);
    } catch (requestError) {
      setErrors(requestError.response?.data?.errors || {});
      setFormError(requestError.response?.data?.message || "Unable to save team details. Try again.");
      setSaving(false);
    }
  };

  const currentLogo = logo?.src || team.teamLogo;

  return <div className="edit-team-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form className="edit-team-modal" role="dialog" aria-modal="true" aria-labelledby="edit-team-title" onSubmit={save} noValidate>
      <header>
        <div><span>{team.teamId}</span><h2 id="edit-team-title">Edit Team</h2></div>
        <button type="button" className="edit-team-close" aria-label="Close" onClick={onClose} disabled={saving}><X size={18} /></button>
      </header>

      <div className="edit-team-body">
        <section className="edit-team-logo">
          <span className="edit-team-label">Team Logo</span>
          <div className="edit-team-logo-row">
            <div className="team-logo-frame">{currentLogo ? <img src={currentLogo} alt="Team logo" /> : <span>NO LOGO</span>}</div>
            <div className="edit-team-logo-actions">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { chooseLogo(event.target.files[0]); event.target.value = ""; }} />
              <button type="button" onClick={() => fileRef.current?.click()}><ImageUp size={15} /> {currentLogo ? "Change Logo" : "Upload Logo"}</button>
              {logo ? <button type="button" className="ghost" onClick={() => setLogo(null)}><RotateCcw size={14} /> Keep current</button> : null}
              <small>{logo ? `New: ${logo.name}` : "PNG or JPG, up to 2 MB. Leave unchanged to keep the current logo."}</small>
              {errors.logo ? <small className="error">{errors.logo}</small> : null}
            </div>
          </div>
        </section>

        <div className="edit-team-grid">
          <Field label="Team Name" error={errors.teamName}><input ref={firstFieldRef} value={form.teamName} onChange={(event) => update("teamName", event.target.value)} /></Field>
          <Field label="Team Head Name" error={errors.leaderName}><input value={form.leaderName} onChange={(event) => update("leaderName", event.target.value)} /></Field>
          <Field label="Team Head Email" error={errors.leaderEmail}><input type="email" value={form.leaderEmail} onChange={(event) => update("leaderEmail", event.target.value)} /></Field>
          <Field label="Team Head Phone" error={errors.leaderPhone}><input type="tel" value={form.leaderPhone} onChange={(event) => update("leaderPhone", event.target.value)} /></Field>
        </div>

        <section className="edit-team-members">
          <span className="edit-team-label">Team Members</span>
          {errors.members ? <small className="error">{errors.members}</small> : null}
          {form.members.map((name, index) => <label key={index} className={`edit-team-member ${errors[`member-${index}`] ? "has-error" : ""}`}>
            <b>{pad(index)}</b>
            <input value={name} aria-label={`Member ${index + 1} name`} onChange={(event) => updateMember(index, event.target.value)} />
            {errors[`member-${index}`] ? <small>{errors[`member-${index}`]}</small> : null}
          </label>)}
        </section>
      </div>

      <footer>
        {formError ? <p className="edit-team-form-error" role="alert">{formError}</p> : null}
        <div>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
        </div>
      </footer>
    </form>
  </div>;
}

export default function AdminTeams() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const token = localStorage.getItem("dexathon_admin_token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const logout = () => { localStorage.removeItem("dexathon_admin_token"); navigate("/admin/login"); };

  const loadTeams = () => {
    setLoading(true);
    setLoadError("");
    axios.get(`${API_URL}/admin/registrations`, { headers })
      .then((response) => setTeams(response.data))
      .catch((error) => {
        if (error.response?.status === 401) { logout(); return; }
        setLoadError(error.response?.data?.message || "Unable to load teams.");
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadTeams, []);

  const visibleTeams = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return teams;
    return teams.filter((team) => [team.teamName, team.teamId, team.leader?.name, team.leader?.email, team.college].some((value) => value?.toLowerCase().includes(term)));
  }, [teams, search]);

  const handleSaved = (registration, successMessage) => {
    setTeams((current) => current.map((team) => (team._id === registration._id ? registration : team)));
    setEditing(null);
    setMessage(successMessage || "Team details updated successfully.");
  };

  return <main className="admin-teams">
    <header className="admin-teams-header">
      <div><p>DEXATHON 2026 ADMIN</p><h1>Teams</h1><span>Review and edit registered team details.</span></div>
      <nav><Link to="/admin/dashboard">Dashboard</Link><Link to="/admin/payment-history">Payment History</Link><Link to="/admin/teams" aria-current="page">Teams</Link><Link to="/admin/payment-settings">Payment Settings</Link><button type="button" onClick={logout}>Logout</button></nav>
    </header>

    {message ? <p className="admin-teams-message" role="status">{message}<button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={14} /></button></p> : null}

    <section className="admin-teams-toolbar">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by team, team ID, team head, email or college" aria-label="Search teams" />
      <span>{visibleTeams.length} of {teams.length} teams</span>
    </section>

    {loading ? <p className="admin-teams-state">Loading teams...</p>
      : loadError ? <div className="admin-teams-state error"><p>{loadError}</p><button type="button" onClick={loadTeams}>Retry</button></div>
        : !visibleTeams.length ? <p className="admin-teams-state">{teams.length ? "No teams match your search." : "No teams have registered yet."}</p>
          : <section className="team-card-grid">{visibleTeams.map((team) => <article className="team-card" key={team._id}>
            <div className="team-card-logo">{team.teamLogo ? <img src={team.teamLogo} alt={`${team.teamName} logo`} /> : <span>NO LOGO</span>}</div>
            <dl>
              <div className="team-card-name"><dt>Team Name</dt><dd>{team.teamName}</dd></div>
              <div><dt>Team Head</dt><dd>{team.leader?.name}</dd></div>
              <div><dt>Email</dt><dd className="break">{team.leader?.email}</dd></div>
              <div><dt>Phone</dt><dd>{team.leader?.phone}</dd></div>
              <div><dt>Team Members</dt><dd><ol>{team.members.map((member, index) => <li key={index}><b>{pad(index)}.</b> {member.name}</li>)}</ol></dd></div>
            </dl>
            <footer><span>Team Size: <b>{team.members.length}</b></span><button type="button" onClick={() => { setMessage(""); setEditing(team); }}><Pencil size={14} /> Edit Team</button></footer>
          </article>)}</section>}

    {editing ? <EditTeamModal team={editing} headers={headers} onClose={() => setEditing(null)} onSaved={handleSaved} /> : null}
  </main>;
}

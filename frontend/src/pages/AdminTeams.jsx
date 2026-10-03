import axios from "axios";
import { ImageUp, Pencil, RotateCcw, Trash2, X } from "lucide-react";
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
  college: team.college || team.collegeName || "",
  members: team.members.map((member) => member.name || ""),
});

const validate = (form) => {
  const errors = {};
  if (!form.teamName.trim()) errors.teamName = "Team name is required.";
  if (!form.leaderName.trim()) errors.leaderName = "Team head name is required.";
  if (!isEmail(form.leaderEmail.trim())) errors.leaderEmail = "Enter a valid email address.";
  if (!form.leaderPhone.trim()) errors.leaderPhone = "Phone number is required.";
  if (!form.college.trim()) errors.college = "College is required.";
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
        college: form.college.trim(),
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
          <div className="edit-team-span"><Field label="College" error={errors.college}><input value={form.college} onChange={(event) => update("college", event.target.value)} /></Field></div>
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

const ROUND_OPTIONS = {
  1: ["PENDING", "LIVE", "COMPLETED", "NOT_SELECTED"],
  2: ["UPCOMING", "PENDING", "LIVE", "SELECTED", "NOT_SELECTED", "COMPLETED"],
  3: ["UPCOMING", "PENDING", "LIVE", "SELECTED", "NOT_SELECTED", "COMPLETED"],
};
const STATUS_LABELS = { PENDING: "Pending", LIVE: "Live", COMPLETED: "Completed", SELECTED: "Selected", NOT_SELECTED: "Not Selected", UPCOMING: "Upcoming" };

function useModalBehaviour(onClose, busy) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
}

function DeleteDialog({ teams, onCancel, onConfirm, busy, error }) {
  useModalBehaviour(onCancel, busy);
  const single = teams.length === 1;
  return <div className="edit-team-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section className="edit-team-modal tm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tm-delete-title">
      <header><div><span>Permanent action</span><h2 id="tm-delete-title">{single ? "Delete Team?" : `Delete ${teams.length} selected teams?`}</h2></div></header>
      <div className="edit-team-body">
        {single ? <p className="tm-delete-text">Team:<br /><b>{teams[0].teamName}</b><br /><br />Are you sure you want to delete this team?</p>
          : <p className="tm-delete-text">This action will permanently remove the selected team records.</p>}
        {!single ? <ul className="tm-delete-list">{teams.slice(0, 8).map((team) => <li key={team._id}>{team.teamName}</li>)}{teams.length > 8 ? <li>…and {teams.length - 8} more</li> : null}</ul> : null}
        <p className="tm-delete-warning">Their payment details, round results and any submitted PDF will be removed too. This cannot be undone.</p>
        {error ? <p className="edit-team-form-error" role="alert">{error}</p> : null}
      </div>
      <footer><div>
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="tm-danger" onClick={onConfirm} disabled={busy} autoFocus>{busy ? "Deleting..." : single ? "Delete Team" : "Delete Teams"}</button>
      </div></footer>
    </section>
  </div>;
}

function BulkEditModal({ teams, colleges, headers, onClose, onSaved }) {
  const [college, setCollege] = useState("");
  const [round, setRound] = useState("");
  const [status, setStatus] = useState("");
  const [notify, setNotify] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useModalBehaviour(onClose, saving);

  const apply = async (event) => {
    event.preventDefault();
    if (!college.trim() && !round) { setError("Choose at least one field to change."); return; }
    if (round && !status) { setError("Choose a status for the selected round."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await axios.post(`${API_URL}/admin/registrations/bulk-update`, {
        ids: teams.map((team) => team._id),
        ...(college.trim() ? { college: college.trim() } : {}),
        ...(round ? { round: Number(round), status, notify } : {}),
      }, { headers });
      onSaved(response.data.teams, response.data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to apply changes. Please try again.");
      setSaving(false);
    }
  };

  return <div className="edit-team-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form className="edit-team-modal tm-dialog" role="dialog" aria-modal="true" aria-labelledby="tm-bulk-title" onSubmit={apply} noValidate>
      <header>
        <div><span>{teams.length} teams selected</span><h2 id="tm-bulk-title">Bulk Edit</h2></div>
        <button type="button" className="edit-team-close" aria-label="Close" onClick={onClose} disabled={saving}><X size={18} /></button>
      </header>
      <div className="edit-team-body">
        <p className="tm-bulk-note">Only the fields you fill in are changed. Team names, team heads and member details stay as they are.</p>
        <Field label="College (leave blank to keep each team's college)">
          <input list="tm-college-options" value={college} onChange={(event) => setCollege(event.target.value)} placeholder="Select or type a college" />
          <datalist id="tm-college-options">{colleges.map((name) => <option key={name} value={name} />)}</datalist>
        </Field>
        <div className="edit-team-grid">
          <Field label="Round">
            <select value={round} onChange={(event) => { setRound(event.target.value); setStatus(""); }}>
              <option value="">Don't change rounds</option>
              {[1, 2, 3].map((n) => <option key={n} value={n}>Round {n}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} disabled={!round} onChange={(event) => setStatus(event.target.value)}>
              <option value="">{round ? "Select status" : "Choose a round first"}</option>
              {round ? ROUND_OPTIONS[round].map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>) : null}
            </select>
          </Field>
        </div>
        {round ? <label className="tm-notify"><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} /> <span>Email the round update to each team head whose status changes</span></label> : null}
        {error ? <p className="edit-team-form-error" role="alert">{error}</p> : null}
      </div>
      <footer><div>
        <button type="button" className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" disabled={saving}>{saving ? "Applying..." : "Apply Changes"}</button>
      </div></footer>
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
  const [collegeFilter, setCollegeFilter] = useState("all");
  const [selected, setSelected] = useState(() => new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
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

  const colleges = useMemo(() => [...new Set(teams.map((team) => team.college || team.collegeName).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [teams]);

  const visibleTeams = useMemo(() => {
    const term = search.trim().toLowerCase();
    return teams.filter((team) => (collegeFilter === "all" || (team.college || team.collegeName) === collegeFilter)
      && (!term || [team.teamName, team.teamId, team.leader?.name, team.leader?.email, team.college].some((value) => value?.toLowerCase().includes(term))));
  }, [teams, search, collegeFilter]);

  // Selection only ever covers teams that still exist; "Select All" covers the teams currently visible.
  const selectedTeams = useMemo(() => teams.filter((team) => selected.has(team._id)), [teams, selected]);
  const visibleSelected = visibleTeams.filter((team) => selected.has(team._id)).length;
  const allVisibleSelected = visibleTeams.length > 0 && visibleSelected === visibleTeams.length;
  const selectAllRef = useRef(null);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = visibleSelected > 0 && !allVisibleSelected; }, [visibleSelected, allVisibleSelected]);

  const toggleOne = (id) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAllVisible = () => setSelected((current) => {
    const next = new Set(current);
    if (allVisibleSelected) visibleTeams.forEach((team) => next.delete(team._id));
    else visibleTeams.forEach((team) => next.add(team._id));
    return next;
  });
  const clearSelection = () => setSelected(new Set());

  const handleSaved = (registration, successMessage) => {
    setTeams((current) => current.map((team) => (team._id === registration._id ? registration : team)));
    setEditing(null);
    setMessage(successMessage || "Team details updated successfully.");
  };

  const editSelected = () => {
    setMessage("");
    if (selectedTeams.length === 1) setEditing(selectedTeams[0]);
    else setBulkEditing(true);
  };

  const handleBulkSaved = (updatedTeams, successMessage) => {
    const byId = new Map(updatedTeams.map((team) => [team._id, team]));
    setTeams((current) => current.map((team) => byId.get(team._id) || team));
    setBulkEditing(false);
    setMessage(successMessage);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      const ids = deleteTargets.map((team) => team._id);
      const response = ids.length === 1
        ? await axios.delete(`${API_URL}/admin/registrations/${ids[0]}`, { headers })
        : await axios.post(`${API_URL}/admin/registrations/bulk-delete`, { ids }, { headers });
      const removed = new Set(response.data.deletedIds || ids);
      setTeams((current) => current.filter((team) => !removed.has(team._id)));
      setSelected((current) => new Set([...current].filter((id) => !removed.has(id))));
      setDeleteTargets(null);
      setMessage(response.data.message || "Team deleted successfully.");
    } catch (error) {
      if (error.response?.status === 401) { logout(); return; }
      setDeleteError(error.response?.data?.message || "Unable to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return <main className="admin-teams">
    <header className="admin-teams-header">
      <div><p>DEXATHON 2026 ADMIN</p><h1>Teams</h1><span>Review and edit registered team details.</span></div>
      <nav><Link to="/admin/dashboard">Dashboard</Link><Link to="/admin/payment-history">Payment History</Link><Link to="/admin/teams" aria-current="page">Teams</Link><Link to="/admin/pdf-submissions">PDF Submissions</Link><Link to="/admin/rounds">Round Status</Link><Link to="/admin/round-selection">Round Selection</Link><Link to="/admin/payment-settings">Payment Settings</Link><button type="button" onClick={logout}>Logout</button></nav>
    </header>

    {message ? <p className="admin-teams-message" role="status">{message}<button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={14} /></button></p> : null}

    <section className={`admin-teams-toolbar tm-toolbar ${selectedTeams.length ? "has-selection" : ""}`}>
      <div className="tm-toolbar-row">
        <label className="tm-select-all">
          <input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} disabled={!visibleTeams.length} onChange={toggleAllVisible} />
          <span>{selectedTeams.length ? `${selectedTeams.length} Selected` : "Select All"}</span>
        </label>
        {selectedTeams.length ? <div className="tm-bulk-actions">
          <button type="button" onClick={editSelected}><Pencil size={14} /> Edit Selected</button>
          <button type="button" className="tm-danger" onClick={() => { setDeleteError(""); setDeleteTargets(selectedTeams); }}><Trash2 size={14} /> Delete Selected</button>
          <button type="button" className="ghost" onClick={clearSelection}>Clear Selection</button>
        </div> : null}
      </div>
      <div className="tm-toolbar-row">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by team, team ID, team head, email or college" aria-label="Search teams" />
        <select value={collegeFilter} onChange={(event) => setCollegeFilter(event.target.value)} aria-label="Filter by college">
          <option value="all">All colleges</option>
          {colleges.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <span>{visibleTeams.length} of {teams.length} teams</span>
      </div>
    </section>

    {loading ? <p className="admin-teams-state">Loading teams...</p>
      : loadError ? <div className="admin-teams-state error"><p>{loadError}</p><button type="button" onClick={loadTeams}>Retry</button></div>
        : !visibleTeams.length ? <p className="admin-teams-state">{teams.length ? "No teams match your search." : "No teams have registered yet."}</p>
          : <section className="team-card-grid">{visibleTeams.map((team) => <article className={`team-card ${selected.has(team._id) ? "is-selected" : ""}`} key={team._id}>
            <label className="tm-card-check"><input type="checkbox" checked={selected.has(team._id)} onChange={() => toggleOne(team._id)} aria-label={`Select ${team.teamName}`} /><span>{selected.has(team._id) ? "Selected" : "Select"}</span></label>
            <div className="team-card-logo">{team.teamLogo ? <img src={team.teamLogo} alt={`${team.teamName} logo`} /> : <span>NO LOGO</span>}</div>
            <dl>
              <div className="team-card-name"><dt>Team Name</dt><dd>{team.teamName}</dd></div>
              <div><dt>Team Head</dt><dd>{team.leader?.name}</dd></div>
              <div><dt>Email</dt><dd className="break">{team.leader?.email}</dd></div>
              <div><dt>Phone</dt><dd>{team.leader?.phone}</dd></div>
              <div><dt>College</dt><dd>{team.college || team.collegeName || "—"}</dd></div>
              <div><dt>Team Members</dt><dd><ol>{team.members.map((member, index) => <li key={index}><b>{pad(index)}.</b> {member.name}</li>)}</ol></dd></div>
            </dl>
            <footer><span>Members: <b>{team.members.length}</b></span>
              <div className="tm-card-actions">
                <button type="button" onClick={() => { setMessage(""); setEditing(team); }}><Pencil size={14} /> Edit</button>
                <button type="button" className="tm-danger" onClick={() => { setMessage(""); setDeleteError(""); setDeleteTargets([team]); }}><Trash2 size={14} /> Delete</button>
              </div>
            </footer>
          </article>)}</section>}

    {editing ? <EditTeamModal team={editing} headers={headers} onClose={() => setEditing(null)} onSaved={handleSaved} /> : null}
    {bulkEditing ? <BulkEditModal teams={selectedTeams} colleges={colleges} headers={headers} onClose={() => setBulkEditing(false)} onSaved={handleBulkSaved} /> : null}
    {deleteTargets ? <DeleteDialog teams={deleteTargets} busy={deleting} error={deleteError} onCancel={() => setDeleteTargets(null)} onConfirm={confirmDelete} /> : null}
  </main>;
}

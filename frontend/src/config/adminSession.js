// Admin session: the signed token plus the role profile returned by the server at login (never the password).
// The server re-checks the role on every request; this copy only decides which pages/menu items to show.
// Kept in memory only, never in browser storage: every fresh open of a /devleader page (new tab, typed link,
// refresh, reopened browser) asks for the password again. Moving between admin pages keeps the session.
let session = null;

// Remove admin sessions that older versions saved in browser storage, so they can't skip the login.
try {
  localStorage.removeItem("dexathon_admin_token");
  localStorage.removeItem("dexathon_admin_profile");
} catch { /* storage unavailable */ }

export const getAdminToken = () => session?.token || null;

export const getAdminProfile = () => session?.profile || null;

export const setAdminSession = (token, profile) => { session = { token, profile }; };

export const clearAdminSession = () => { session = null; };

export const canAccessSection = (section) => {
  const profile = getAdminProfile();
  if (!profile) return false;
  if (profile.role === "SUPER_ADMIN") return true;
  const sections = profile.sections || [];
  if (sections.includes(section)) return true;
  if (section === "teamLists" && (sections.includes("payments") || sections.includes("teams"))) return true;
  return false;
};
// Admin pages live under /devleader; profiles from before the move may still hold an /admin/... home.
export const adminHome = () => (getAdminProfile()?.home || "/devleader/dashboard").replace(/^\/admin\//, "/devleader/");

export const ROLE_LABELS = {
  SUPER_ADMIN: "General Admin",
  PAYMENT_ADMIN: "Team Lists Admin",
  TEAM_ADMIN: "Team Admin",
  ROUND_ADMIN: "Round Admin",
  PDF_ADMIN: "PDF Admin",
};

// Admin session: the signed token plus the role profile returned by the server at login (never the password).
// The server re-checks the role on every request; this copy only decides which pages/menu items to show.
const TOKEN_KEY = "dexathon_admin_token";
const PROFILE_KEY = "dexathon_admin_profile";

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };

export const getAdminToken = () => read(TOKEN_KEY);

export const getAdminProfile = () => {
  if (!getAdminToken()) return null;
  try {
    // Sessions from before roles existed belonged to the General Admin.
    return JSON.parse(read(PROFILE_KEY)) || { role: "SUPER_ADMIN", sections: ["dashboard", "teams", "payments", "pdf", "rounds", "paymentSettings", "users"], home: "/admin/dashboard" };
  } catch {
    return null;
  }
};

export const setAdminSession = (token, profile) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch { /* storage unavailable */ }
};

export const clearAdminSession = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
  } catch { /* storage unavailable */ }
};

export const canAccessSection = (section) => {
  const profile = getAdminProfile();
  if (!profile) return false;
  if (profile.role === "SUPER_ADMIN") return true;
  const sections = profile.sections || [];
  if (sections.includes(section)) return true;
  if (section === "teamLists" && (sections.includes("payments") || sections.includes("teams"))) return true;
  return false;
};
export const adminHome = () => getAdminProfile()?.home || "/admin/dashboard";

export const ROLE_LABELS = {
  SUPER_ADMIN: "General Admin",
  PAYMENT_ADMIN: "Team Lists Admin",
  TEAM_ADMIN: "Team Admin",
  ROUND_ADMIN: "Round Admin",
  PDF_ADMIN: "PDF Admin",
};

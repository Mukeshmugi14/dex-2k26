// Which admin roles may use which admin section. SUPER_ADMIN (General Admin) may use everything.
export const SECTION_ROLES = {
  dashboard: ["TEAM_ADMIN"],
  teamLists: ["TEAM_ADMIN", "PAYMENT_ADMIN"],
  teams: ["TEAM_ADMIN"],
  pdf: ["PDF_ADMIN"],
  rounds: ["ROUND_ADMIN"],
  payments: ["PAYMENT_ADMIN", "TEAM_ADMIN"], // compatibility
  users: [],
};

export const ROLE_HOME = {
  SUPER_ADMIN: "/admin/dashboard",
  PAYMENT_ADMIN: "/admin/team-lists",
  TEAM_ADMIN: "/admin/team-lists",
  ROUND_ADMIN: "/admin/round-selection",
  PDF_ADMIN: "/admin/pdf-submissions",
};

export const canAccess = (role, section) => role === "SUPER_ADMIN" || (SECTION_ROLES[section] || []).includes(role);
export const sectionsFor = (role) => Object.keys(SECTION_ROLES).filter((section) => canAccess(role, section));

export const adminProfile = (admin) => ({
  id: String(admin._id || admin.id),
  username: admin.username,
  name: admin.name || "",
  role: admin.role || "SUPER_ADMIN",
  sections: sectionsFor(admin.role || "SUPER_ADMIN"),
  home: ROLE_HOME[admin.role || "SUPER_ADMIN"],
});

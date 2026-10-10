import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearAdminSession, getAdminProfile } from "../config/adminSession";

// Every admin page shares this menu; it shows only the sections the signed-in admin may use.
export const ADMIN_LINKS = [
  ["/admin/dashboard", "Dashboard", "dashboard"],
  ["/admin/team-lists", "Team Lists", "teamLists"],
  ["/admin/teams", "Teams", "teams"],
  ["/admin/pdf-submissions", "PDF Submissions", "pdf"],
  ["/admin/rounds", "Round Status", "rounds"],
  ["/admin/round-selection", "Round Selection", "rounds"],
  ["/admin/users", "Admin Users", "users"],
];

export default function AdminNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sections = getAdminProfile()?.sections || [];
  const logout = () => { clearAdminSession(); navigate("/admin/login"); };
  const canSee = (section) => sections.includes(section) || (section === "teamLists" && (sections.includes("payments") || sections.includes("teams")));

  return <>
    {ADMIN_LINKS.filter(([, , section]) => canSee(section)).map(([to, label]) => (
      <Link key={to} to={to} aria-current={pathname === to ? "page" : undefined}>{label}</Link>
    ))}
    <button type="button" onClick={logout}>Logout</button>
  </>;
}

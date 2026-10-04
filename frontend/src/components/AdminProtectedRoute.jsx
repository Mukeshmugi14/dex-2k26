import axios from "axios";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { API_URL } from "../config/api";
import { adminHome, canAccessSection, clearAdminSession, getAdminToken, setAdminSession } from "../config/adminSession";

// Signed-in check for the admin area. With a `section`, admins without that section go to their own home page.
// Before redirecting, the role is refreshed from the server once, so newly granted access works without signing in again.
export default function AdminProtectedRoute({ section, children }) {
  const { pathname } = useLocation();
  const token = getAdminToken();
  const allowed = !section || canAccessSection(section);
  const [checked, setChecked] = useState(allowed);

  useEffect(() => {
    if (!token || allowed) return undefined;
    let cancelled = false;
    axios.get(`${API_URL}/admin/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => { if (!cancelled) setAdminSession(token, response.data.admin); })
      .catch((error) => { if (!cancelled && error.response?.status === 401) clearAdminSession(); })
      .finally(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, [token, allowed, pathname]);

  if (!getAdminToken()) return <Navigate to="/admin/login" replace />;
  if (!section || canAccessSection(section)) return children || <Outlet />;
  if (!checked) return null; // checking the latest role with the server
  const home = adminHome();
  if (home === pathname) { clearAdminSession(); return <Navigate to="/admin/login" replace />; }
  return <Navigate to={home} replace />;
}

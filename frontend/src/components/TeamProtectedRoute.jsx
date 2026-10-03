import { Navigate, Outlet } from "react-router-dom";
import { getTeamToken } from "../config/teamSession";

export default function TeamProtectedRoute() {
  return getTeamToken() ? <Outlet /> : <Navigate to="/team-login" replace />;
}

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import TeamProtectedRoute from "./components/TeamProtectedRoute";
import PortalGateway from "./pages/PortalGateway";
import TeamLogin from "./pages/TeamLogin";
import TeamDashboard from "./pages/TeamDashboard";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import TeamLists from "./pages/TeamLists";
import AdminTeams from "./pages/AdminTeams";
import AdminPdfSubmissions from "./pages/AdminPdfSubmissions";
import SubmitDocument from "./pages/SubmitDocument";
import AdminRounds from "./pages/AdminRounds";
import AdminRoundSelection from "./pages/AdminRoundSelection";
import AdminUsers from "./pages/AdminUsers";
import "./styles/dexathon.css";
import "./styles/responsive.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Portal Gateway & Team Portal */}
        <Route path="/" element={<PortalGateway />} />
        <Route path="/team-login" element={<TeamLogin />} />
        <Route element={<TeamProtectedRoute />}>
          <Route path="/team-dashboard" element={<TeamDashboard />} />
        </Route>
        <Route path="/submit-document/:token" element={<SubmitDocument />} />

        {/* Admin Authentication & Sections */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            <AdminProtectedRoute section="dashboard">
              <AdminDashboard />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/team-lists"
          element={
            <AdminProtectedRoute section="teamLists">
              <TeamLists />
            </AdminProtectedRoute>
          }
        />
        {/* Backwards compatibility: redirect payment-history to team-lists */}
        <Route path="/admin/payment-history" element={<Navigate to="/admin/team-lists" replace />} />
        <Route
          path="/admin/teams"
          element={
            <AdminProtectedRoute section="teams">
              <AdminTeams />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/pdf-submissions"
          element={
            <AdminProtectedRoute section="pdf">
              <AdminPdfSubmissions />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/rounds"
          element={
            <AdminProtectedRoute section="rounds">
              <AdminRounds />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/round-selection"
          element={
            <AdminProtectedRoute section="rounds">
              <AdminRoundSelection />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminProtectedRoute section="users">
              <AdminUsers />
            </AdminProtectedRoute>
          }
        />

        {/* Catch-all redirect to Portal Gateway */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

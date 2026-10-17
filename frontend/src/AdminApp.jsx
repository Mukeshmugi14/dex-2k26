import { Navigate, Route, Routes } from "react-router-dom";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminAnalytics from "./pages/AdminAnalytics";
import TeamLists from "./pages/TeamLists";
import AdminTeams from "./pages/AdminTeams";
import AdminPdfSubmissions from "./pages/AdminPdfSubmissions";
import AdminPrototypes from "./pages/AdminPrototypes";
import AdminColleges from "./pages/AdminColleges";
import AdminRounds from "./pages/AdminRounds";
import AdminRoundSelection from "./pages/AdminRoundSelection";
import AdminUsers from "./pages/AdminUsers";

// Admin panel under /devleader. App.jsx loads this only in local development (npm run dev), so the deployed
// site's build contains no admin pages at all; the backend also refuses admin requests that aren't local.
const guarded = (section, page) => <AdminProtectedRoute section={section}>{page}</AdminProtectedRoute>;

export default function AdminApp() {
  return (
    <Routes>
      <Route index element={<Navigate to="/devleader/login" replace />} />
      <Route path="login" element={<AdminLogin />} />
      <Route path="dashboard" element={guarded("dashboard", <AdminDashboard />)} />
      <Route path="analytics" element={guarded("dashboard", <AdminAnalytics />)} />
      <Route path="team-lists" element={guarded("teamLists", <TeamLists />)} />
      <Route path="teams" element={guarded("teams", <AdminTeams />)} />
      <Route path="colleges" element={guarded("teams", <AdminColleges />)} />
      <Route path="pdf-submissions" element={guarded("pdf", <AdminPdfSubmissions />)} />
      <Route path="prototypes" element={guarded("pdf", <AdminPrototypes />)} />
      <Route path="rounds" element={guarded("rounds", <AdminRounds />)} />
      <Route path="round-selection" element={guarded("rounds", <AdminRoundSelection />)} />
      <Route path="users" element={guarded("users", <AdminUsers />)} />
      <Route path="*" element={<Navigate to="/devleader/login" replace />} />
    </Routes>
  );
}

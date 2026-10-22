import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import TeamProtectedRoute from "./components/TeamProtectedRoute";
import PortalGateway from "./pages/PortalGateway";
import TeamLogin from "./pages/TeamLogin";
import TeamDashboard from "./pages/TeamDashboard";
import SubmitDocument from "./pages/SubmitDocument";
import "./styles/dexathon.css";
import "./styles/responsive.css";

// The admin panel exists only in local development (npm run dev). import.meta.env.DEV is written inline so the
// bundler sees the constant false in production and drops the admin code: no admin page ships to the deployed site.
const AdminApp = import.meta.env.DEV ? lazy(() => import("./AdminApp")) : null;
// The Evaluator Portal is part of the deployed site; its code loads only when someone opens /evaluator.
const EvaluatorApp = lazy(() => import("./evaluator/EvaluatorApp"));

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

        {/* Evaluator Portal (Round 1 PPT judging) */}
        <Route path="/evaluator/*" element={<Suspense fallback={null}><EvaluatorApp /></Suspense>} />

        {/* Admin panel: local development only */}
        {AdminApp ? <Route path="/devleader/*" element={<Suspense fallback={null}><AdminApp /></Suspense>} /> : null}

        {/* Catch-all redirect to Portal Gateway (on the deployed site this includes /devleader/...) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

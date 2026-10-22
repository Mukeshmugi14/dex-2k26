import { LogOut } from "lucide-react";
import { Link, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import "./evaluator.css";
import EvaluatorLogin from "./EvaluatorLogin";
import EvaluatorHome from "./EvaluatorHome";
import EvaluatorSheet from "./EvaluatorSheet";
import { clearEvaluatorSession, getEvaluatorSession } from "../config/evaluatorSession";

function EvaluatorLayout() {
  const session = getEvaluatorSession();
  const navigate = useNavigate();
  if (!session?.token) return <Navigate to="/evaluator/login" replace />;
  const signOut = () => { clearEvaluatorSession(); navigate("/evaluator/login", { replace: true }); };
  return <div className="eval-shell">
    <header className="eval-topbar">
      <Link to="/evaluator" className="eval-brand">DE<b>X</b>ATHON <em>2026</em> <span>Evaluator Portal</span></Link>
      <div className="eval-user"><span title={session.evaluator?.email}>{session.evaluator?.name || session.evaluator?.email}</span>
        <button type="button" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
    </header>
    <Outlet />
  </div>;
}

export default function EvaluatorApp() {
  return <Routes>
    <Route path="login" element={<EvaluatorLogin />} />
    <Route element={<EvaluatorLayout />}>
      <Route index element={<EvaluatorHome />} />
      <Route path="team/:id" element={<EvaluatorSheet />} />
    </Route>
    <Route path="*" element={<Navigate to="/evaluator" replace />} />
  </Routes>;
}

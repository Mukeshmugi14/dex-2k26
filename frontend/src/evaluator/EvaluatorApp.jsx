import { LogOut } from "lucide-react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import "./evaluator.css";
import EvaluatorLogin from "./EvaluatorLogin";
import EvaluatorHome from "./EvaluatorHome";
import EvaluatorSheet from "./EvaluatorSheet";
import Round2Home from "./Round2Home";
import Round2Sheet from "./Round2Sheet";
import { clearEvaluatorSession, getEvaluatorSession } from "../config/evaluatorSession";

function EvaluatorLayout() {
  const session = getEvaluatorSession();
  const navigate = useNavigate();
  if (!session?.token) return <Navigate to="/evaluator/login" replace />;
  const rounds = evaluatorRoundsOf(session);
  const signOut = () => { clearEvaluatorSession(); navigate("/evaluator/login", { replace: true }); };
  return <div className="eval-shell">
    <header className="eval-topbar">
      <Link to={rounds.includes("ROUND1") ? "/evaluator" : "/evaluator/round2"} className="eval-brand">DE<b>X</b>ATHON <em>2026</em> <span>Evaluator Portal</span></Link>
      <nav className="eval-rounds" aria-label="Round">
        {rounds.includes("ROUND1") ? <NavLink to="/evaluator" end className={({ isActive }) => (isActive ? "is-on" : "")}>Round 1 · PPT</NavLink> : null}
        {rounds.includes("ROUND2") ? <NavLink to="/evaluator/round2" className={({ isActive }) => (isActive ? "is-on" : "")}>Round 2 · Prototypes</NavLink> : null}
      </nav>
      <div className="eval-user"><span title={session.evaluator?.username || session.evaluator?.email}>{session.evaluator?.name || session.evaluator?.username || session.evaluator?.email}</span>
        <button type="button" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
    </header>
    <Outlet />
  </div>;
}

// Rounds this account can score (older saved sessions have none: Round 1 only).
const evaluatorRoundsOf = (session) => (session?.evaluator?.rounds?.length ? session.evaluator.rounds : ["ROUND1"]);
// Sends an account to a round it can use: Round 2-only accounts never see Round 1 pages, and the other way round.
function OnlyRound({ round, children }) {
  const rounds = evaluatorRoundsOf(getEvaluatorSession());
  if (rounds.includes(round)) return children;
  return <Navigate to={rounds.includes("ROUND1") ? "/evaluator" : "/evaluator/round2"} replace />;
}

export default function EvaluatorApp() {
  return <Routes>
    <Route path="login" element={<EvaluatorLogin />} />
    <Route element={<EvaluatorLayout />}>
      <Route index element={<OnlyRound round="ROUND1"><EvaluatorHome /></OnlyRound>} />
      <Route path="team/:id" element={<OnlyRound round="ROUND1"><EvaluatorSheet /></OnlyRound>} />
      <Route path="round2" element={<OnlyRound round="ROUND2"><Round2Home /></OnlyRound>} />
      <Route path="round2/team/:id" element={<OnlyRound round="ROUND2"><Round2Sheet /></OnlyRound>} />
    </Route>
    <Route path="*" element={<Navigate to="/evaluator" replace />} />
  </Routes>;
}

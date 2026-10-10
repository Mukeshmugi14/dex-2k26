import axios from "axios";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Users } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import "./TeamPortal.css";
import { API_URL } from "../config/api";
import { getTeamToken, setTeamToken } from "../config/teamSession";

export default function TeamLogin() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (getTeamToken()) return <Navigate to="/team-dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    const trimmedId = userId.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    const cleanPassword = password.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    if (!trimmedId || !cleanPassword) {
      setError("Please enter your Team ID (User ID) and password.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await axios.post(`${API_URL}/team/login`, {
        userId: trimmedId,
        teamId: trimmedId,
        teamName: trimmedId,
        email: trimmedId,
        password: cleanPassword,
      });
      setTeamToken(response.data.token);
      navigate("/team-dashboard", { replace: true });
    } catch (requestError) {
      setError(
        requestError.response?.status === 401
          ? requestError.response?.data?.message || "Invalid Team ID or password."
          : requestError.response?.data?.message || "Unable to sign in. Please check your connection and try again."
      );
      setSubmitting(false);
    }
  };

  return (
    <main className="team-portal team-login">
      <div className="team-login-glow" aria-hidden="true" />
      <section className="team-login-card">
        <header>
          <span className="team-brand">
            DE<b>X</b>ATHON <em>2026</em>
          </span>
          <h1>Team Login Portal</h1>
          <p>Sign in using your Team ID and portal password</p>
        </header>
        <form onSubmit={submit} noValidate>
          <label className="team-field">
            <span>User ID (Team ID)</span>
            <div className="team-input">
              <Users size={17} />
              <input
                type="text"
                autoComplete="username"
                placeholder="Enter your Team ID (e.g. DEX26001)"
                value={userId}
                onChange={(event) => {
                  setUserId(event.target.value);
                  setError("");
                }}
              />
            </div>
          </label>
          <label className="team-field">
            <span>Password</span>
            <div className="team-input">
              <LockKeyhole size={17} />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter password (Dexathon@2026)"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
              />
              <button
                type="button"
                className="team-eye"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          {error ? <p className="team-login-error" role="alert">{error}</p> : null}
          <button type="submit" className="team-login-submit" disabled={submitting}>
            {submitting ? "Signing in..." : <>Login <ArrowRight size={17} /></>}
          </button>
        </form>
        <footer>
          Use your assigned Team ID (e.g. <strong>DEX26001</strong>) as your User ID with the password received in your confirmation email (<strong>Dexathon@2026</strong>).
        </footer>
      </section>
    </main>
  );
}

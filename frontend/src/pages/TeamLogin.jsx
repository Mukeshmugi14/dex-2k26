import axios from "axios";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Rocket } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import "./TeamPortal.css";
import { API_URL } from "../config/api";
import { getTeamToken, setTeamToken } from "../config/teamSession";

export default function TeamLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (getTeamToken()) return <Navigate to="/team-dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    const trimmedEmail = email.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    const cleanPassword = password.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    if (!trimmedEmail || !cleanPassword) {
      setError("Please enter your Team Head email and Team ID.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await axios.post(`${API_URL}/team/login`, {
        email: trimmedEmail,
        password: cleanPassword,
      });
      setTeamToken(response.data.token);
      navigate("/team-dashboard", { replace: true });
    } catch (requestError) {
      setError(
        requestError.response?.status === 401
          ? requestError.response?.data?.message || "Invalid Team Head email or Team ID."
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
          <p>Sign in using your Team Head email and Team ID</p>
        </header>
        <div className="team-login-notice" role="note">
          <Rocket size={16} aria-hidden="true" />
          <span><b>Round 2 prototype submission</b> is open for the teams selected in Round 1 until <b>29 Oct 2026, 11:59 PM IST</b>.</span>
        </div>
        <form onSubmit={submit} noValidate>
          <label className="team-field">
            <span>Team Head Email</span>
            <div className="team-input">
              <Mail size={17} />
              <input
                type="email"
                autoComplete="username"
                placeholder="Enter your registered Team Head email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
              />
            </div>
          </label>
          <label className="team-field">
            <span>Password (Team ID)</span>
            <div className="team-input">
              <LockKeyhole size={17} />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your Team ID (e.g. DEX26001)"
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
          Log in with your registered <strong>Team Head email</strong> and use your team's <strong>Team ID</strong> (e.g. <strong>DEX26001</strong>) as the password.
        </footer>
      </section>
    </main>
  );
}

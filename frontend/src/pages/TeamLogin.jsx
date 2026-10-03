import axios from "axios";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
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
    if (!email.trim() || !password) { setError("Enter your registered email and password."); return; }
    setSubmitting(true);
    setError("");
    try {
      const response = await axios.post(`${API_URL}/team/login`, { email: email.trim(), password });
      setTeamToken(response.data.token);
      navigate("/team-dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.status === 401 ? "Invalid email or password." : requestError.response?.data?.message || "Unable to sign in. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  return <main className="team-portal team-login">
    <div className="team-login-glow" aria-hidden="true" />
    <section className="team-login-card">
      <header>
        <span className="team-brand">DE<b>X</b>ATHON <em>2026</em></span>
        <h1>Team Head Portal</h1>
        <p>Access your registration and round details</p>
      </header>
      <form onSubmit={submit} noValidate>
        <label className="team-field">
          <span>Team Head Email</span>
          <div className="team-input"><Mail size={17} /><input type="email" autoComplete="email" placeholder="Enter your registered email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} /></div>
        </label>
        <label className="team-field">
          <span>Password</span>
          <div className="team-input"><LockKeyhole size={17} />
            <input type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} />
            <button type="button" className="team-eye" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
        </label>
        {error ? <p className="team-login-error" role="alert">{error}</p> : null}
        <button type="submit" className="team-login-submit" disabled={submitting}>{submitting ? "Signing in..." : <>Login <ArrowRight size={17} /></>}</button>
      </form>
      <footer>Use the Team Head email you registered with. Only teams with a confirmed payment can sign in.</footer>
    </section>
  </main>;
}

import axios from "axios";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import "../pages/TeamPortal.css";
import "./evaluator.css";
import { API_URL } from "../config/api";
import { getEvaluatorToken, setEvaluatorSession } from "../config/evaluatorSession";

const clean = (value) => value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();

// Sign in with email (or access ID) + password. First time / forgot password: a one-time code is emailed, then a new password is set.
export default function EvaluatorLogin() {
  const [mode, setMode] = useState("login"); // login | request | verify
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [challenge, setChallenge] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  if (getEvaluatorToken()) return <Navigate to="/evaluator" replace />;

  const fail = (requestError, fallback) => setError(requestError.response?.data?.errors?.password || requestError.response?.data?.message || fallback);
  const signedIn = (data) => {
    setEvaluatorSession(data.token, data.evaluator);
    const rounds = data.evaluator?.rounds || ["ROUND1"];
    navigate(rounds.includes("ROUND1") ? "/evaluator" : "/evaluator/round2", { replace: true });
  };

  const login = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!clean(email) || !password) { setError("Enter your email / access ID and password."); return; }
    setBusy(true); setError("");
    try {
      signedIn((await axios.post(`${API_URL}/evaluator/auth/login`, { email: clean(email), password })).data);
    } catch (requestError) {
      if (requestError.response?.data?.needsSetup) { setMode("request"); setNotice(requestError.response.data.message); }
      else fail(requestError, "Unable to sign in. Check your connection and try again.");
      setBusy(false);
    }
  };

  const requestCode = async (event) => {
    event?.preventDefault();
    if (busy) return;
    if (!clean(email)) { setError("Enter your evaluator email."); return; }
    setBusy(true); setError("");
    try {
      const { data } = await axios.post(`${API_URL}/evaluator/auth/request-code`, { email: clean(email) });
      setChallenge(data.challenge); setNotice(data.message); setMode("verify"); setCode("");
    } catch (requestError) { fail(requestError, "Unable to send the code. Try again."); }
    finally { setBusy(false); }
  };

  const setPasswordWithCode = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(clean(code))) { setError("Enter the 6-digit code from the email."); return; }
    if (newPassword.length < 10) { setError("Use at least 10 characters for your password."); return; }
    if (newPassword !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true); setError("");
    try {
      signedIn((await axios.post(`${API_URL}/evaluator/auth/set-password`, { challenge, code: clean(code), password: newPassword })).data);
    } catch (requestError) {
      if (requestError.response?.data?.expired) { setMode("request"); setNotice(""); }
      fail(requestError, "Unable to set your password. Try again.");
      setBusy(false);
    }
  };

  const field = (label, Icon, input, extra = null) => <label className="team-field"><span>{label}</span><div className="team-input"><Icon size={17} />{input}{extra}</div></label>;
  const eye = <button type="button" className="team-eye" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>;
  const loginInput = field("Email or Access ID", UserRound, <input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Your email or access ID" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />);
  const emailInput = field("Evaluator Email", Mail, <input type="email" autoComplete="username" placeholder="Your evaluator email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} disabled={mode === "verify"} />);

  return (
    <main className="team-portal team-login">
      <div className="team-login-glow" aria-hidden="true" />
      <section className="team-login-card">
        <header>
          <span className="team-brand">DE<b>X</b>ATHON <em>2026</em></span>
          <h1>Evaluator Portal</h1>
          <p>{mode === "login" ? "Sign in to evaluate Round 1 PPTs and Round 2 prototypes" : mode === "request" ? "First time or forgot password? Get a one-time code" : "Enter the code and choose your password"}</p>
        </header>
        {params.get("expired") && mode === "login" ? <p className="eval-login-note">You were signed out after a period of inactivity.</p> : null}
        {notice && mode !== "login" ? <p className="eval-login-note">{notice}</p> : null}

        {mode === "login" ? <form onSubmit={login} noValidate>
          {loginInput}
          {field("Password", LockKeyhole, <input type={show ? "text" : "password"} autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />, eye)}
          {error ? <p className="team-login-error" role="alert">{error}</p> : null}
          <button type="submit" className="team-login-submit" disabled={busy}>{busy ? "Signing in..." : <>Sign in <ArrowRight size={17} /></>}</button>
          <button type="button" className="eval-login-link" onClick={() => { setMode("request"); setError(""); setNotice(""); }}><KeyRound size={15} /> First time / Forgot password</button>
        </form> : null}

        {mode === "request" ? <form onSubmit={requestCode} noValidate>
          {emailInput}
          {error ? <p className="team-login-error" role="alert">{error}</p> : null}
          <button type="submit" className="team-login-submit" disabled={busy}>{busy ? "Sending..." : <>Email me a one-time code <ArrowRight size={17} /></>}</button>
          <button type="button" className="eval-login-link" onClick={() => { setMode("login"); setError(""); setNotice(""); }}><ArrowLeft size={15} /> Back to sign in</button>
        </form> : null}

        {mode === "verify" ? <form onSubmit={setPasswordWithCode} noValidate>
          {emailInput}
          {field("One-time code", ShieldCheck, <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setError(""); }} />)}
          {field("New password", LockKeyhole, <input type={show ? "text" : "password"} autoComplete="new-password" placeholder="At least 10 characters, letters and numbers" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(""); }} />, eye)}
          {field("Confirm password", LockKeyhole, <input type={show ? "text" : "password"} autoComplete="new-password" placeholder="Type it again" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(""); }} />)}
          {error ? <p className="team-login-error" role="alert">{error}</p> : null}
          <button type="submit" className="team-login-submit" disabled={busy}>{busy ? "Saving..." : <>Set password and sign in <ArrowRight size={17} /></>}</button>
          <div className="eval-login-row">
            <button type="button" className="eval-login-link" onClick={() => requestCode()} disabled={busy}>Send a new code</button>
            <button type="button" className="eval-login-link" onClick={() => { setMode("login"); setError(""); setNotice(""); }}><ArrowLeft size={15} /> Back to sign in</button>
          </div>
        </form> : null}

        <footer>Only evaluators invited by the DEXATHON organisers can sign in. The code expires in 10 minutes and works once.</footer>
      </section>
    </main>
  );
}

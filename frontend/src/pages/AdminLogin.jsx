import axios from "axios";
import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, MailCheck } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import "./AdminLogin.css";
import { API_URL } from "../config/api";
import { adminHome, getAdminToken, setAdminSession } from "../config/adminSession";

const apiUrl = API_URL;
const MIN_PASSWORD = 10;

function PasswordInput({ value, onChange, autoComplete, visible, onToggle, placeholder }) {
  return <span className="admin-password-field">
    <input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} placeholder={placeholder} required />
    <button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={onToggle}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
  </span>;
}

// Admin login.
//   Normal:          Gmail + password  →  4-digit code emailed to that Gmail  →  logged in
//   First time / forgot password:  Gmail  →  4-digit code  →  new password  →  logged in
export default function AdminLogin() {
  const [step, setStep] = useState("password"); // password | code | setup-email | setup-code
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState(null); // { token, sentTo }
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  // Shown when the admin pages logged out after 30 minutes without activity.
  const [notice, setNotice] = useState(() => (new URLSearchParams(window.location.search).get("expired") ? "You were logged out after 30 minutes without activity. Please log in again." : ""));
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const go = (next) => { setStep(next); setError(""); setNotice(""); setCode(""); setShowPassword(false); };
  const startOver = (message = "") => { setChallenge(null); setPassword(""); setNewPassword(""); setConfirmPassword(""); go("password"); if (message) setError(message); };
  const enter = (data) => { setPassword(""); setNewPassword(""); setConfirmPassword(""); setAdminSession(data.token, data.admin); navigate(data.admin?.home || "/devleader/dashboard", { replace: true }); };
  const run = async (action) => {
    setSubmitting(true); setError(""); setNotice("");
    try { await action(); } finally { setSubmitting(false); }
  };
  const failed = (requestError, fallback) => requestError.response?.data?.message || fallback;

  const requestLoginCode = async () => {
    const { data } = await axios.post(`${apiUrl}/admin/login`, { username: username.trim(), password });
    setChallenge({ token: data.challenge, sentTo: data.sentTo });
    setNotice(data.message || "");
  };
  const requestSetupCode = async () => {
    const { data } = await axios.post(`${apiUrl}/admin/login/setup`, { username: username.trim() });
    setChallenge({ token: data.challenge, sentTo: data.sentTo });
    setNotice(data.message || "");
  };

  const submitPassword = (event) => { event.preventDefault(); run(async () => {
    try { await requestLoginCode(); setStep("code"); setCode(""); } catch (requestError) {
      const hint = requestError.response?.data?.canSetup ? " First time, or forgot it? Use “Get a code” below." : "";
      setError(failed(requestError, "Unable to sign in. Try again.") + hint);
    }
  }); };

  const submitCode = (event) => { event.preventDefault(); if (!/^\d{4}$/.test(code)) { setError("Enter the 4-digit code from your Gmail."); return; } run(async () => {
    try { enter((await axios.post(`${apiUrl}/admin/login/verify`, { challenge: challenge.token, code })).data); } catch (requestError) {
      setCode("");
      if (requestError.response?.data?.restart) startOver(failed(requestError, "Please log in again.")); else setError(failed(requestError, "Unable to verify the code. Try again."));
    }
  }); };

  const submitSetupEmail = (event) => { event.preventDefault(); run(async () => {
    try { await requestSetupCode(); setStep("setup-code"); setCode(""); } catch (requestError) { setError(failed(requestError, "Unable to send a code. Try again.")); }
  }); };

  const submitSetupCode = (event) => { event.preventDefault();
    if (!/^\d{4}$/.test(code)) { setError("Enter the 4-digit code from your Gmail."); return; }
    if (newPassword.length < MIN_PASSWORD) { setError(`Your new password needs at least ${MIN_PASSWORD} characters.`); return; }
    if (newPassword !== confirmPassword) { setError("The two passwords don't match."); return; }
    run(async () => {
      try { enter((await axios.post(`${apiUrl}/admin/login/setup/verify`, { challenge: challenge.token, code, newPassword })).data); } catch (requestError) {
        const data = requestError.response?.data;
        if (data?.restart) { setChallenge(null); setCode(""); go("setup-email"); setError(failed(requestError, "Please request a new code.")); return; }
        if (data?.field !== "newPassword") setCode("");
        setError(failed(requestError, "Unable to set the password. Try again."));
      }
    });
  };

  const resend = () => run(async () => {
    try { await (step === "code" ? requestLoginCode() : requestSetupCode()); } catch (requestError) {
      setError(failed(requestError, "Unable to send a new code."));
      if (step === "code" && requestError.response?.status === 401) startOver();
    }
  });

  if (getAdminToken()) return <Navigate to={adminHome()} replace />;

  const messages = <>{notice ? <small className="admin-login-notice">{notice}</small> : null}{error ? <small className="admin-login-error">{error}</small> : null}</>;
  const codeField = <label>Verification code<input className="admin-otp-input" value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} inputMode="numeric" autoComplete="one-time-code" maxLength={4} placeholder="••••" autoFocus required /></label>;
  const codeActions = (onBack) => <div className="admin-otp-actions">
    <button type="button" className="admin-login-help" onClick={onBack} disabled={submitting}><ArrowLeft size={14} /> Back</button>
    <button type="button" className="admin-login-help" onClick={resend} disabled={submitting}>Resend code</button>
  </div>;

  const forms = {
    password: <form onSubmit={submitPassword}>
      <div className="admin-login-heading"><h2>Administrator Login</h2><p>Sign in with your admin Gmail and password. A 4-digit code is then emailed to you.</p></div>
      <label>Gmail address<input type="email" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="you@gmail.com" required /></label>
      <label>Password<PasswordInput value={password} onChange={setPassword} autoComplete="current-password" visible={showPassword} onToggle={() => setShowPassword((v) => !v)} /></label>
      {messages}
      <button className="admin-login-submit" disabled={submitting}>{submitting ? "Checking..." : "Continue"}</button>
      <button type="button" className="admin-login-setup" onClick={() => go("setup-email")} disabled={submitting}><KeyRound size={15} /> First time logging in, or forgot your password? <b>Get a code</b></button>
    </form>,

    code: <form onSubmit={submitCode}>
      <div className="admin-login-heading"><h2><MailCheck size={20} /> Verify it's you</h2><p>Enter the 4-digit code sent to <b>{challenge?.sentTo}</b>. It expires in 5 minutes.</p></div>
      {codeField}
      {messages}
      <button className="admin-login-submit" disabled={submitting || code.length !== 4}>{submitting ? "Verifying..." : "Verify & Login"}</button>
      {codeActions(() => startOver())}
    </form>,

    "setup-email": <form onSubmit={submitSetupEmail}>
      <div className="admin-login-heading"><h2><KeyRound size={20} /> Set your password</h2><p>For a first-time login or a forgotten password. Enter your admin Gmail and we'll email you a 4-digit code.</p></div>
      <label>Gmail address<input type="email" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="you@gmail.com" required autoFocus /></label>
      {messages}
      <button className="admin-login-submit" disabled={submitting}>{submitting ? "Sending..." : "Send code"}</button>
      <button type="button" className="admin-login-help" onClick={() => go("password")} disabled={submitting}><ArrowLeft size={14} /> Back to login</button>
    </form>,

    "setup-code": <form onSubmit={submitSetupCode}>
      <div className="admin-login-heading"><h2><MailCheck size={20} /> Check your Gmail</h2><p>If <b>{challenge?.sentTo}</b> is an admin account, a 4-digit code was sent there. It expires in 5 minutes.</p></div>
      {codeField}
      <label>New password<PasswordInput value={newPassword} onChange={(v) => { setNewPassword(v); setError(""); }} autoComplete="new-password" visible={showPassword} onToggle={() => setShowPassword((v) => !v)} placeholder={`At least ${MIN_PASSWORD} characters, letters and numbers`} /></label>
      <label>Confirm new password<PasswordInput value={confirmPassword} onChange={(v) => { setConfirmPassword(v); setError(""); }} autoComplete="new-password" visible={showPassword} onToggle={() => setShowPassword((v) => !v)} /></label>
      {messages}
      <button className="admin-login-submit" disabled={submitting || code.length !== 4}>{submitting ? "Saving..." : "Set password & Login"}</button>
      {codeActions(() => go("setup-email"))}
    </form>,
  };

  return <main className="admin-login"><section className="admin-login-card"><header className="admin-login-brand"><span>DEXATHON 2026</span><h1>Admin Portal</h1></header>{forms[step]}<footer><LockKeyhole size={14} /> Secure Event Administration · 2-step verification</footer></section></main>;
}

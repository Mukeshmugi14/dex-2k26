import axios from "axios";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminLogin.css";
import { API_URL } from "../config/api";

const apiUrl = API_URL;

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await axios.post(`${apiUrl}/admin/login`, { username, password });
      localStorage.setItem("dexathon_admin_token", response.data.token);
      navigate("/admin/dashboard");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="admin-login"><section className="admin-login-card"><header className="admin-login-brand"><span>DEXATHON 2026</span><h1>Admin Portal</h1></header><form onSubmit={submit}><div className="admin-login-heading"><h2>Administrator Login</h2><p>Sign in to manage the event securely.</p></div><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>Password<span className="admin-password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>{error ? <small className="admin-login-error">{error}</small> : null}<button className="admin-login-submit" disabled={submitting}>{submitting ? "Signing in..." : "Sign In"}</button></form><footer><LockKeyhole size={14} /> Secure Event Administration</footer></section></main>;
}

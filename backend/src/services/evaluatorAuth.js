// Evaluator Portal sign-in. Runs on the deployed site (unlike the admin panel), so every step is hardened:
// - one-time 6-digit codes: keyed hash only, 10-minute expiry, 5 tries, single use, 60 s between sends;
// - a signed "challenge" ties the code step to the email that asked for it;
// - passwords are bcrypt-hashed; wrong passwords/codes are counted per account and per IP (database-backed
//   lockouts, so they hold across serverless instances);
// - session tokens carry the account's sessionVersion, so a password change or deactivation ends old sessions.
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { adminJwtSecret } from "./adminSecurity.js";

export const EVAL_OTP_DIGITS = 6;
export const EVAL_OTP_TTL_MS = 10 * 60 * 1000;
export const EVAL_OTP_MAX_ATTEMPTS = 5;
export const EVAL_OTP_RESEND_MS = 60 * 1000;
export const EVAL_SESSION_HOURS = 12;
export const MIN_EVALUATOR_PASSWORD = 10;

// EVALUATOR_JWT_SECRET (at least 32 characters) if set, so the portal can be enabled without changing JWT_SECRET
// (which would sign every team out); otherwise a strong JWT_SECRET. Keys are derived per purpose, so evaluator,
// admin and team tokens can never be swapped.
const MIN_SECRET_LENGTH = 32;
// Last resort when neither secret is set or strong enough: a key derived from the database connection string.
// It's long, private and server-only, and anyone holding it already has the database, so it adds no exposure.
const databaseDerivedSecret = () => {
  const uri = String(process.env.MONGO_URI || process.env.MONGODB_URI || process.env.mongo_uri || process.env.mongodb_uri || "").trim();
  return uri.length >= MIN_SECRET_LENGTH ? crypto.createHash("sha256").update(`dexathon-evaluator-key:${uri}:${process.env.JWT_SECRET || ""}`).digest("hex") : null;
};
const evaluatorSecret = () => {
  const own = String(process.env.EVALUATOR_JWT_SECRET || "").trim();
  return own.length >= MIN_SECRET_LENGTH ? own : adminJwtSecret() || databaseDerivedSecret();
};
const baseSecret = () => {
  const value = evaluatorSecret();
  if (!value) throw Object.assign(new Error("EVALUATOR_JWT_SECRET / JWT_SECRET is not securely configured."), { code: "EWEAKSECRET" });
  return value;
};
const key = (purpose) => crypto.createHmac("sha256", baseSecret()).update(`dexathon-evaluator:${purpose}`).digest("hex");
export const evaluatorSecretConfigured = () => Boolean(evaluatorSecret());
export const EVAL_SECRET_MESSAGE = "Evaluator login is not available yet: the server's EVALUATOR_JWT_SECRET (or JWT_SECRET) is missing or too short. Ask the organisers.";

const SESSION = { audience: "dexathon-evaluator", issuer: "dexathon-2026" };
const CHALLENGE = { audience: "dexathon-evaluator-code", issuer: "dexathon-2026" };

export const signEvaluatorSession = (evaluator) => jwt.sign({ sub: String(evaluator._id), v: evaluator.sessionVersion || 0, role: "evaluator" }, key("session"), { ...SESSION, expiresIn: `${EVAL_SESSION_HOURS}h` });
export const verifyEvaluatorSession = (token) => {
  try {
    const payload = jwt.verify(String(token || ""), key("session"), SESSION);
    return payload.role === "evaluator" ? payload : null;
  } catch {
    return null;
  }
};

// The challenge names the email that asked for a code (not whether it exists), so the reply never reveals which emails are evaluators.
export const signCodeChallenge = (email) => jwt.sign({ email: String(email).toLowerCase(), n: crypto.randomBytes(8).toString("hex") }, key("challenge"), { ...CHALLENGE, expiresIn: Math.floor(EVAL_OTP_TTL_MS / 1000) });
export const verifyCodeChallenge = (token) => {
  try { return jwt.verify(String(token || ""), key("challenge"), CHALLENGE).email || null; } catch { return null; }
};

export const generateEvaluatorOtp = () => String(crypto.randomInt(0, 10 ** EVAL_OTP_DIGITS)).padStart(EVAL_OTP_DIGITS, "0");
export const hashEvaluatorOtp = (evaluatorId, code) => crypto.createHmac("sha256", key("otp")).update(`${evaluatorId}:${code}`).digest("hex");
export const evaluatorOtpMatches = (evaluatorId, code, storedHash) => {
  if (!storedHash || !new RegExp(`^\\d{${EVAL_OTP_DIGITS}}$`).test(String(code || ""))) return false;
  const given = Buffer.from(hashEvaluatorOtp(evaluatorId, code), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return given.length === stored.length && crypto.timingSafeEqual(given, stored);
};

const COMMON = new Set(["password123", "dexathon2026", "dexathon@2026", "evaluator123", "12345678910", "qwerty12345"]);
export const evaluatorPasswordProblem = (password, email) => {
  const value = typeof password === "string" ? password : "";
  if (value.length < MIN_EVALUATOR_PASSWORD) return `Use at least ${MIN_EVALUATOR_PASSWORD} characters.`;
  if (value.length > 128) return "Use at most 128 characters.";
  if (COMMON.has(value.toLowerCase())) return "That password is too common. Choose another.";
  const local = String(email || "").split("@")[0].toLowerCase();
  if (local.length >= 4 && value.toLowerCase().includes(local)) return "Don't use your email name in the password.";
  if (!/[a-z]/i.test(value) || !/\d/.test(value)) return "Use both letters and numbers.";
  return "";
};

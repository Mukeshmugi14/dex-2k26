// Admin login, step 2: a 4-digit code emailed to the admin's Gmail after a correct password.
// A 4-digit code is only safe because it is short-lived and has few tries: it expires after 5 minutes,
// allows 5 wrong attempts, and only a keyed hash is stored. A signed "challenge" ties step 2 to step 1,
// so the code alone (without the password) can never log anyone in.
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { adminJwtSecret } from "./adminSecurity.js";

export const OTP_DIGITS = 4;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MS = 30 * 1000;

// Never falls back to a built-in value: without a strong JWT_SECRET, admin login is refused before this is used.
const secret = () => {
  const value = adminJwtSecret();
  if (!value) throw Object.assign(new Error("JWT_SECRET is not securely configured."), { code: "EWEAKSECRET" });
  return value;
};
const CHALLENGE = { audience: "dexathon-admin-otp", issuer: "dexathon-2026" };

export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

export const generateOtp = () => String(crypto.randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, "0");

// Keyed per admin, so a leaked hash can't be checked against another account or without the server secret.
export const hashOtp = (adminId, code) => crypto.createHmac("sha256", secret()).update(`${adminId}:${code}`).digest("hex");

export const otpMatches = (adminId, code, storedHash) => {
  if (!storedHash || !/^\d{4}$/.test(String(code || ""))) return false;
  const given = Buffer.from(hashOtp(adminId, code), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return given.length === stored.length && crypto.timingSafeEqual(given, stored);
};

// purpose "login" (password already checked) or "setup" (first-time / forgot password). A challenge for one
// flow is never accepted by the other.
export const signChallenge = (adminId, purpose = "login") => jwt.sign({ sub: String(adminId), purpose: `admin-${purpose}` }, secret(), { ...CHALLENGE, expiresIn: Math.floor(OTP_TTL_MS / 1000) });

export const verifyChallenge = (token, purpose = "login") => {
  try {
    const payload = jwt.verify(String(token || ""), secret(), CHALLENGE);
    return payload.purpose === `admin-${purpose}` ? payload.sub : null;
  } catch {
    return null;
  }
};

// Password rules for a password the chief head sets themselves.
export const MIN_ADMIN_PASSWORD = 10;
const EXPOSED_PASSWORDS = new Set(["2006feb14", "admin@123", "dexathon@2026", "password123", "12345678910"]);
export const passwordProblem = (password, email) => {
  const value = typeof password === "string" ? password : "";
  if (value.length < MIN_ADMIN_PASSWORD) return `Use at least ${MIN_ADMIN_PASSWORD} characters.`;
  if (value.length > 128) return "Use at most 128 characters.";
  if (EXPOSED_PASSWORDS.has(value.toLowerCase())) return "That password is known to be exposed. Choose a new one.";
  if (email && value.toLowerCase().includes(String(email).split("@")[0].toLowerCase())) return "Don't use your Gmail name in the password.";
  if (!/[a-z]/i.test(value) || !/\d/.test(value)) return "Use both letters and numbers.";
  return "";
};

// "mukesh@gmail.com" → "mu****@gmail.com", so the page can say where the code went without exposing the address.
export const maskEmail = (email) => {
  const [name, domain] = String(email || "").split("@");
  return domain ? `${name.slice(0, 2)}${"*".repeat(Math.max(2, name.length - 2))}@${domain}` : "";
};

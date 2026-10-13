// Admin login hardening: a strong signing secret, the caller's IP, and database-backed lockouts
// (so they also work on Vercel, where every request may run in a fresh serverless instance).
import mongoose from "mongoose";

// Placeholders that are public (in .env.example or old code) and must never sign admin logins.
const PUBLIC_SECRETS = new Set(["replace_with_a_long_random_secret", "dexathon-jwt-secret", "changeme", "secret", "your_jwt_secret"]);
const MIN_SECRET_LENGTH = 32;

// The admin signing secret, or null when it is missing, too short or a public placeholder.
export const adminJwtSecret = () => {
  const value = String(process.env.JWT_SECRET || process.env.jwt_secret || "");
  return value.length >= MIN_SECRET_LENGTH && !PUBLIC_SECRETS.has(value.trim().toLowerCase()) ? value : null;
};
export const WEAK_SECRET_MESSAGE = "Admin login is disabled: the server's JWT_SECRET is missing or is a public placeholder. Set JWT_SECRET to a long random value.";

// Vercel and Render put the visitor's address in x-real-ip / x-forwarded-for; fall back to the socket.
export const clientIp = (request) => {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return String(request.headers["x-real-ip"] || forwarded || request.socket?.remoteAddress || "unknown").slice(0, 64);
};
export const clientAgent = (request) => String(request.headers["user-agent"] || "unknown").slice(0, 200);

// Lockout rules: failures counted per Gmail account and per IP within a 15-minute window.
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;
const LIMITS = { acct: 5, ip: 10 };

const LoginThrottle = mongoose.models.LoginThrottle || mongoose.model("LoginThrottle", new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  failures: { type: Number, default: 0 },
  windowStart: Date,
  lockedUntil: Date,
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }, // MongoDB removes stale counters on its own
}));

export const throttleKeys = (ip, account) => [`ip:${ip}`, ...(account ? [`acct:${String(account).trim().toLowerCase()}`] : [])];

// Minutes left on the longest active lock among these keys, or 0 when none is locked.
export const lockedMinutes = async (keys) => {
  const locks = await LoginThrottle.find({ key: { $in: keys }, lockedUntil: { $gt: new Date() } }, "lockedUntil").lean();
  return locks.length ? Math.ceil((Math.max(...locks.map((l) => l.lockedUntil.getTime())) - Date.now()) / 60000) : 0;
};

// Counts one failure for each key (atomically, resetting a window older than 15 minutes); locks a key that hits its limit.
export const recordFailure = async (keys) => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  let locked = false;
  for (const key of keys) {
    const fresh = { $lt: [{ $ifNull: ["$windowStart", new Date(0)] }, cutoff] };
    const doc = await LoginThrottle.findOneAndUpdate({ key }, [{ $set: {
      failures: { $cond: [fresh, 1, { $add: [{ $ifNull: ["$failures", 0] }, 1] }] },
      windowStart: { $cond: [fresh, now, "$windowStart"] },
      expiresAt: new Date(now.getTime() + WINDOW_MS + LOCK_MS),
    } }], { upsert: true, new: true, updatePipeline: true }).lean();
    const limit = LIMITS[key.split(":")[0]] || LIMITS.ip;
    if (doc.failures >= limit) {
      await LoginThrottle.updateOne({ key }, { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS), expiresAt: new Date(now.getTime() + LOCK_MS + WINDOW_MS) } });
      locked = true;
    }
  }
  return locked;
};

export const clearFailures = (keys) => LoginThrottle.deleteMany({ key: { $in: keys } });

export const lockedResponse = (minutes) => ({ success: false, locked: true, message: `Too many failed attempts. Admin login is locked for ${minutes} minute${minutes === 1 ? "" : "s"}. Try again later.` });

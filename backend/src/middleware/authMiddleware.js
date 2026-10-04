import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../models/Admin.js";
import { canAccess } from "../services/adminAccess.js";

// Every admin request re-checks the account (exists, active, current role) so role changes and
// deactivation take effect without waiting for the token to expire. A 15-second cache keeps this cheap.
const CACHE_MS = 15_000;
const accountCache = new Map();
export const forgetAdminAccount = (id) => accountCache.delete(String(id));

const loadAccount = async (id) => {
  const cached = accountCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.account;
  const account = mongoose.isValidObjectId(id) ? await Admin.findById(id, "username name role active").lean() : null;
  accountCache.set(id, { account, expires: Date.now() + CACHE_MS });
  return account;
};

export const requireAdmin = async (request, response, next) => {
  let payload;
  try {
    const token = request.headers.authorization?.split(" ")[1];
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return response.status(401).json({ message: "Admin authentication required." });
  }
  const account = await loadAccount(String(payload.id));
  if (!account || account.active === false) return response.status(401).json({ message: "Admin authentication required." });
  request.admin = { id: String(account._id), username: account.username, name: account.name || "", role: account.role || "SUPER_ADMIN" };
  return next();
};

// Section guard used on every admin API route (the frontend hides pages too, but this is the real check).
export const requireSection = (section) => (request, response, next) => (
  canAccess(request.admin?.role, section) ? next() : response.status(403).json({ message: "You don't have access to this section." })
);

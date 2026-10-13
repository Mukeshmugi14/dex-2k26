// Replaces every admin login with ONE chief-head account: the Gmail in EMAIL_USER + a new password,
// verified by a 4-digit code emailed through the same Gmail SMTP.
//   node src/scripts/resetAdminAccounts.js           → preview only
//   node src/scripts/resetAdminAccounts.js --apply   → back up, then reset
// - Generates a strong password and writes it to backend/.env (ADMIN_USERNAME/ADMIN_PASSWORD); it is never printed.
// - Deletes all other admin accounts, after saving them to backups/admins-before-reset-<time>.json.
// - Keeps "admin" only as a locked placeholder (disabled, random unknown password): old deployments that still run
//   the pre-12-Oct seed code recreate "admin" with their saved password whenever it is missing.
import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Admin from "../models/Admin.js";
import { isEmail } from "../services/adminOtpService.js";

const ENV_FILE = ".env";
const PLACEHOLDER = "admin";

// 20 characters from letters, digits and symbols (no look-alikes such as 0/O, 1/l).
const strongPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^*-_+=";
  return Array.from({ length: 20 }, () => chars[crypto.randomInt(chars.length)]).join("");
};

const setEnv = (text, key, value) => {
  const line = `${key}=${value}`;
  return new RegExp(`^${key}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`;
};

const run = async () => {
  const apply = process.argv.includes("--apply");
  const gmail = String(process.env.EMAIL_USER || process.env.email_user || "").trim().toLowerCase();
  if (!isEmail(gmail)) throw new Error("EMAIL_USER in backend/.env must be the Gmail address used for SMTP.");

  await connectDB();
  const admins = await Admin.find({}).select("+otp").lean();
  console.log(`Admin accounts now: ${admins.map((a) => `${a.username}${a.active === false ? " (disabled)" : ""}`).join(", ")}`);
  console.log(`New login: ${gmail} + new password (saved in backend/.env) + 4-digit code emailed to ${gmail}`);
  console.log(`Will delete: ${admins.filter((a) => a.username !== PLACEHOLDER).map((a) => a.username).join(", ") || "none"}`);
  console.log(`Will lock "${PLACEHOLDER}" as a disabled placeholder with a random unknown password.`);
  if (!apply) { console.log("\nPreview only. Run again with --apply."); return; }

  fs.mkdirSync("backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(`backups/admins-before-reset-${stamp}.json`, JSON.stringify(admins, null, 1));

  const password = strongPassword();
  let env = fs.readFileSync(ENV_FILE, "utf8");
  for (const key of ["ADMIN_USERNAME", "admin_username"]) env = setEnv(env, key, gmail);
  for (const key of ["ADMIN_PASSWORD", "admin_password"]) env = setEnv(env, key, password);
  fs.writeFileSync(ENV_FILE, env);

  const unknownHash = await bcrypt.hash(crypto.randomBytes(48).toString("base64"), 12);
  await Admin.deleteMany({ username: { $ne: PLACEHOLDER } });
  await Admin.updateOne(
    { username: PLACEHOLDER },
    { $set: { active: false, passwordHash: unknownHash, name: "Locked placeholder (do not use)", role: "SUPER_ADMIN" }, $unset: { otp: "", email: "" } },
    { upsert: true },
  );
  await Admin.create({ username: gmail, email: gmail, name: "Chief Head", role: "SUPER_ADMIN", active: true, passwordHash: await bcrypt.hash(password, 12) });

  const after = await Admin.find({}, "username role active").lean();
  console.log(`\nSaved old accounts to backups/admins-before-reset-${stamp}.json`);
  console.log(`New password written to backend/.env (ADMIN_PASSWORD). It is not shown here.`);
  console.log(`Admin accounts now: ${after.map((a) => `${a.username} ${a.role}${a.active === false ? " (disabled)" : " (active)"}`).join(", ")}`);
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

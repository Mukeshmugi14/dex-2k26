import bcrypt from "bcryptjs";
import crypto from "crypto";
import Admin from "../models/Admin.js";

let adminSeeded = false;

const repairEmailIndex = async () => {
  try {
    const indexes = await Admin.collection.indexes();
    const email = indexes.find((index) => index.name === "email_1");
    if (email && !email.sparse) {
      await Admin.collection.dropIndex("email_1");
      await Admin.collection.createIndex({ email: 1 }, { unique: true, sparse: true });
      console.log("Repaired admins.email index (now sparse).");
    }
  } catch (error) {
    console.error("Unable to repair admins.email index:", error.message);
  }
};

export const seedAdmin = async () => {
  if (adminSeeded) return;
  adminSeeded = true;

  await repairEmailIndex();
  await Admin.updateMany({ role: { $exists: false } }, { $set: { role: "SUPER_ADMIN", active: true } });

  const username = process.env.ADMIN_USERNAME || process.env.admin_username;
  const password = process.env.ADMIN_PASSWORD || process.env.admin_password;
  if (!username) return;

  // An existing account is never changed here: the chief head sets or resets the password on the login page
  // with a code emailed to their Gmail, and startup must not overwrite it (or switch a disabled account back on).
  if (await Admin.exists({ username })) return;

  // Only seed when there is no admin at all, so an old ADMIN_USERNAME never recreates a retired account.
  if (await Admin.exists({})) return;
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username) ? username.toLowerCase() : undefined;
  // Without ADMIN_PASSWORD the account gets a random password nobody knows; the chief head then sets their own
  // on the login page with "Get a code" (needs a Gmail username, so the code can be emailed).
  if (!password && !email) return;
  const initial = password || crypto.randomBytes(32).toString("base64");
  await Admin.create({ username: email || username, email, passwordHash: await bcrypt.hash(initial, 12) });
  console.log(`Initial admin created for ${username}`);
};

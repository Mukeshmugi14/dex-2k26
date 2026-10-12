import bcrypt from "bcryptjs";
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
  if (!username || !password) return;

  // The env admin's password is fixed by ADMIN_PASSWORD: if it was changed elsewhere, reset it to the env value.
  const existingAdmin = await Admin.findOne({ username });
  if (existingAdmin) {
    if (!(await bcrypt.compare(password, existingAdmin.passwordHash))) {
      await Admin.updateOne({ _id: existingAdmin._id }, { $set: { passwordHash: await bcrypt.hash(password, 12), active: true } });
      console.log(`Admin password synced from environment for ${username}`);
    }
    return;
  }

  // Only seed when there is no admin at all, so an old ADMIN_USERNAME never recreates a retired account.
  if (await Admin.exists({})) return;
  await Admin.create({ username, passwordHash: await bcrypt.hash(password, 12) });
  console.log(`Initial admin created for ${username}`);
};

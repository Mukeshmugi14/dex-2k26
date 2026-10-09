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

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;

  const existingAdmin = await Admin.findOne({ username });
  if (existingAdmin) return;

  await Admin.create({ username, passwordHash: await bcrypt.hash(password, 12) });
  console.log(`Initial admin created for ${username}`);
};

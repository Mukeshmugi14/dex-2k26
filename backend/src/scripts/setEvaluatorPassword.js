import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "../config/db.js";
import Evaluator from "../models/Evaluator.js";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node src/scripts/setEvaluatorPassword.js <email> <password>");
  process.exit(1);
}

async function main() {
  await connectDB();

  console.log(`Setting password for evaluator: ${email}`);

  const evaluator = await Evaluator.findOne({ email });
  if (!evaluator) {
    console.error(`Evaluator not found with email: ${email}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const updated = await Evaluator.findOneAndUpdate(
    { email },
    {
      $set: {
        passwordHash,
        passwordSetAt: new Date(),
        active: true,
      },
      $unset: { otp: "" },
      $inc: { sessionVersion: 1 },
    },
    { new: true }
  ).select("+passwordHash");

  // Clear any lockout throttle keys
  const LoginThrottle = mongoose.models.LoginThrottle || mongoose.model(
    "LoginThrottle",
    new mongoose.Schema({
      key: { type: String, required: true, unique: true },
      failures: { type: Number, default: 0 },
      windowStart: Date,
      lockedUntil: Date,
      expiresAt: Date,
    })
  );

  const cleared = await LoginThrottle.deleteMany({
    key: { $in: [`eval-acct:${email}`, `acct:${email}`] },
  });

  const verified = await bcrypt.compare(password, updated.passwordHash);

  console.log("Evaluator updated successfully:", {
    email: updated.email,
    name: updated.name,
    active: updated.active,
    passwordSetAt: updated.passwordSetAt,
    sessionVersion: updated.sessionVersion,
    passwordVerified: verified,
    lockoutsCleared: cleared.deletedCount,
  });

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to update evaluator password:", err);
  process.exit(1);
});

import mongoose from "mongoose";

// A Round 1 PPT evaluator (judge). Added by an admin; signs in to the Evaluator Portal with their own email:
// the first time (or after "forgot password") with a one-time code emailed to them, then with the password they set.
export default mongoose.model("Evaluator", new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, trim: true, default: "" },
  active: { type: Boolean, default: true },
  passwordHash: { type: String, select: false },
  passwordSetAt: Date,
  // Bumped when the password changes or the account is deactivated/reset, so older sessions stop working.
  sessionVersion: { type: Number, default: 0 },
  // One-time code for first login / password reset. Only a keyed hash is stored, never returned unless "+otp".
  otp: { type: { hash: String, expiresAt: Date, attempts: Number, sentAt: Date }, select: false },
  lastLoginAt: Date,
  // How much this evaluator's sheets count in a PPT's final score (weighted average): 0 = not counted, 2 = double.
  scoreWeight: { type: Number, default: 1, min: 0, max: 5 },
  createdBy: String,
}, { timestamps: true }));

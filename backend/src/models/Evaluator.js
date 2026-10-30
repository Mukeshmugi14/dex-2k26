import mongoose from "mongoose";

// Which rounds an evaluator can score. Accounts made before rounds existed have no field and are Round 1 only.
export const EVALUATOR_ROUNDS = ["ROUND1", "ROUND2"];
export const ROUND1_EVALUATORS = { $or: [{ rounds: { $exists: false } }, { rounds: { $size: 0 } }, { rounds: "ROUND1" }] };
export const ROUND2_EVALUATORS = { rounds: "ROUND2" };
export const evaluatorRounds = (evaluator) => (Array.isArray(evaluator?.rounds) && evaluator.rounds.length ? evaluator.rounds : ["ROUND1"]);

// A Round 1 PPT evaluator (judge). Added by an admin; signs in to the Evaluator Portal with their own email:
// the first time (or after "forgot password") with a one-time code emailed to them, then with the password they set.
export default mongoose.model("Evaluator", new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  // Optional access ID to sign in with instead of the email (e.g. Round 2 evaluators).
  username: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  rounds: { type: [{ type: String, enum: EVALUATOR_ROUNDS }], default: undefined },
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

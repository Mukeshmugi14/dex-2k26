import mongoose from "mongoose";

export const ADMIN_ROLES = ["SUPER_ADMIN", "PAYMENT_ADMIN", "TEAM_ADMIN", "ROUND_ADMIN", "PDF_ADMIN"];

export default mongoose.model("Admin", new mongoose.Schema({
  username: { type: String, unique: true, sparse: true, trim: true },
  email: { type: String, unique: true, sparse: true, trim: true },
  name: { type: String, trim: true, default: "" },
  // SUPER_ADMIN is the General Admin with full access; the others see only their own section.
  role: { type: String, enum: ADMIN_ROLES, default: "SUPER_ADMIN" },
  active: { type: Boolean, default: true },
  passwordHash: { type: String, required: true },
  lastLoginAt: Date,
}, { timestamps: true }));

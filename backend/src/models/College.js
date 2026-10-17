import mongoose from "mongoose";

// College registry: one document per institution. collegeId is stable and never reused; a merged college stays
// (inactive, with mergedInto) so old references and the audit trail keep working.
export default mongoose.model("College", new mongoose.Schema({
  collegeId: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  cities: [{ type: String, trim: true }],
  active: { type: Boolean, default: true },
  verified: { type: Boolean, default: true },
  mergedInto: { type: String, default: null },
  source: { type: String, enum: ["seed", "admin"], default: "admin" },
  createdBy: String,
}, { timestamps: true }));

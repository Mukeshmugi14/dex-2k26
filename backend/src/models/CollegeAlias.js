import mongoose from "mongoose";

// Alternative names of a college (short names, historical names, verified misspellings).
// `normalized` is unique, so one spelling can never belong to two colleges; moving it requires an explicit review.
// Only verified aliases are used for automatic matching.
const collegeAliasSchema = new mongoose.Schema({
  alias: { type: String, required: true, trim: true },
  normalized: { type: String, required: true, unique: true },
  collegeId: { type: String, required: true, index: true },
  verified: { type: Boolean, default: true },
  source: { type: String, enum: ["seed", "admin", "review"], default: "admin" },
  createdBy: String,
  verifiedBy: String,
  verifiedAt: Date,
}, { timestamps: true });

export default mongoose.model("CollegeAlias", collegeAliasSchema);

import mongoose from "mongoose";

// Append-only record of every manual or bulk change to the college registry and to registration mappings.
export default mongoose.model("CollegeAudit", new mongoose.Schema({
  action: { type: String, required: true }, // college-create, college-edit, college-merge, alias-add, alias-remove, alias-verify, alias-move, registration-resolve, reprocess, migration
  actor: { type: String, default: "system" },
  collegeId: String,
  registrationId: String,
  teamId: String,
  before: mongoose.Schema.Types.Mixed,
  after: mongoose.Schema.Types.Mixed,
  note: String,
}, { timestamps: { createdAt: true, updatedAt: false } }));

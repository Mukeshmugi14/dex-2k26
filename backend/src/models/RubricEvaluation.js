import mongoose from "mongoose";

// One evaluator's PPT Evaluation Sheet for one team (see services/rubric.js). Drafts can be saved; a submitted
// sheet counts toward the team's average score.
const rubricEvaluationSchema = new mongoose.Schema({
  registration: { type: mongoose.Schema.Types.ObjectId, ref: "Registration", required: true, index: true },
  teamId: String,
  evaluator: { type: mongoose.Schema.Types.ObjectId, ref: "Evaluator", required: true, index: true },
  evaluatorEmail: String,
  evaluatorName: String,
  rubricVersion: String,
  projectTitle: String,
  psCategory: String,
  panel: String,
  checks: { fileOpens: Boolean, teamIdMatches: Boolean, officialTemplate: Boolean, allSlides: Boolean, missingSlides: String },
  policyFlags: [String],
  policyNote: String,
  levels: { type: Map, of: Number, default: {} },
  comments: { type: Map, of: String, default: {} },
  strengths: [String],
  improvements: [String],
  recommendation: String,
  coiDeclared: Boolean,
  total: { type: Number, default: 0 },
  status: { type: String, enum: ["draft", "submitted"], default: "draft" },
  submittedAt: Date,
}, { timestamps: true });

rubricEvaluationSchema.index({ registration: 1, evaluator: 1 }, { unique: true });

export default mongoose.model("RubricEvaluation", rubricEvaluationSchema);

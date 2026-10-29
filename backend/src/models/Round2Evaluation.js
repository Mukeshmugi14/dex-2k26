import mongoose from "mongoose";

// One evaluator's Round 2 prototype sheet for one team (see services/round2Rubric.js).
const round2EvaluationSchema = new mongoose.Schema({
  registration: { type: mongoose.Schema.Types.ObjectId, ref: "Registration", required: true, index: true },
  teamId: String,
  evaluator: { type: mongoose.Schema.Types.ObjectId, ref: "Evaluator", required: true, index: true },
  evaluatorEmail: String,
  evaluatorName: String,
  rubricVersion: String,
  category: { type: String, enum: ["SOFTWARE", "HARDWARE"] },
  prototypeUrl: String, // the link that was scored
  levels: { type: Map, of: Number, default: {} },
  flags: [String],
  remarks: String,
  recommendation: String,
  coiDeclared: Boolean,
  total: { type: Number, default: 0 },
  status: { type: String, enum: ["draft", "submitted"], default: "draft" },
  submittedAt: Date,
}, { timestamps: true });

round2EvaluationSchema.index({ registration: 1, evaluator: 1 }, { unique: true });

export default mongoose.model("Round2Evaluation", round2EvaluationSchema);

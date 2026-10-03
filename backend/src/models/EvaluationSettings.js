import mongoose from "mongoose";

// Admin-configured scoring rules for the second-round PDF evaluation (a single document).
const evaluationSettingsSchema = new mongoose.Schema({
  maxScorePerCriterion: { type: Number, min: 1, default: null },
  criteriaLabels: { type: [String], default: ["Criterion 1", "Criterion 2", "Criterion 3", "Criterion 4"] },
}, { timestamps: true });

export default mongoose.model("EvaluationSettings", evaluationSettingsSchema);

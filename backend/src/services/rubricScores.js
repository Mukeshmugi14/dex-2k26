import mongoose from "mongoose";
import Registration from "../models/Registration.js";
import RubricEvaluation from "../models/RubricEvaluation.js";

// A team's Round 1 score is the average of its submitted evaluation sheets (out of 100). It's stored on the team
// (evaluation.totalScore) so the admin list and, once released, the Team Portal show it.
export const refreshTeamRubricScore = async (registrationId) => {
  const id = new mongoose.Types.ObjectId(String(registrationId));
  const [stats] = await RubricEvaluation.aggregate([{ $match: { registration: id, status: "submitted" } }, { $group: { _id: null, avg: { $avg: "$total" }, n: { $sum: 1 } } }]);
  const set = stats
    ? { "evaluation.totalScore": Math.round(stats.avg * 10) / 10, "evaluation.evaluatorCount": stats.n, "evaluation.evaluatedAt": new Date() }
    : { "evaluation.evaluatorCount": 0 };
  await Registration.updateOne({ _id: id }, stats ? { $set: set } : { $set: set, $unset: { "evaluation.totalScore": "" } });
};

/** Per-team summary of submitted sheets for admin lists: Map(registrationId → { count, average, drafts, sheets[] }). */
export const rubricSummaries = async (registrationIds) => {
  const sheets = await RubricEvaluation.find({ registration: { $in: registrationIds } }, "registration evaluatorName evaluatorEmail status total recommendation policyFlags submittedAt updatedAt").lean();
  const out = new Map();
  for (const s of sheets) {
    const key = String(s.registration);
    const entry = out.get(key) || { count: 0, drafts: 0, sum: 0, sheets: [] };
    if (s.status === "submitted") { entry.count++; entry.sum += s.total || 0; } else entry.drafts++;
    entry.sheets.push({ evaluator: s.evaluatorName || s.evaluatorEmail, email: s.evaluatorEmail, status: s.status, total: s.total, recommendation: s.recommendation || "", policyFlags: s.policyFlags || [], submittedAt: s.submittedAt || null, updatedAt: s.updatedAt });
    out.set(key, entry);
  }
  for (const entry of out.values()) { entry.average = entry.count ? Math.round((entry.sum / entry.count) * 10) / 10 : null; delete entry.sum; }
  return out;
};

import mongoose from "mongoose";
import Evaluator, { ROUND2_EVALUATORS } from "../models/Evaluator.js";
import Registration from "../models/Registration.js";
import Round2Evaluation from "../models/Round2Evaluation.js";
import { scoreFromSheets } from "./rubricScores.js";

// Round 2 is scored by the Round 2 evaluators (accounts with rounds: ROUND2), all of them on every prototype.
// A team's score is the plain average of their submitted sheets (equal weight), final once every one has submitted.
// Stored on the team as round2Evaluation so admin pages read one number.
export const round2Panel = async () => (await Evaluator.find({ active: { $ne: false }, ...ROUND2_EVALUATORS }, "_id").sort({ createdAt: 1 }).lean()).map((e) => e._id);
const equalWeights = (panel) => new Map(panel.map((id) => [String(id), 1]));

export const refreshTeamRound2Score = async (registrationId) => {
  const id = new mongoose.Types.ObjectId(String(registrationId));
  const [sheets, panel] = await Promise.all([
    Round2Evaluation.find({ registration: id }, "evaluator status total").lean(),
    round2Panel(),
  ]);
  const score = scoreFromSheets(sheets, panel, equalWeights(panel));
  const set = { "round2Evaluation.evaluatorCount": score.count, "round2Evaluation.scoreComplete": score.complete };
  await Registration.updateOne({ _id: id }, score.average === null
    ? { $set: set, $unset: { "round2Evaluation.totalScore": "", "round2Evaluation.scoreSpread": "" } }
    : { $set: { ...set, "round2Evaluation.totalScore": score.average, "round2Evaluation.scoreSpread": score.spread, "round2Evaluation.evaluatedAt": new Date() } });
  return score;
};

/** Map(registrationId → { average, count, complete, spread, sheets[] }) for admin lists. */
export const round2Summaries = async (teams) => {
  const ids = teams.map((t) => t._id);
  const [sheets, panel] = await Promise.all([
    Round2Evaluation.find({ registration: { $in: ids } }, "registration evaluator evaluatorName evaluatorEmail status total recommendation flags").lean(),
    round2Panel(),
  ]);
  const weights = equalWeights(panel);
  const byTeam = new Map();
  for (const s of sheets) byTeam.set(String(s.registration), [...(byTeam.get(String(s.registration)) || []), s]);
  return new Map(teams.map((t) => {
    const list = byTeam.get(String(t._id)) || [];
    const score = scoreFromSheets(list, panel, weights);
    return [String(t._id), { ...score, sheets: list.map((s) => ({ evaluator: s.evaluatorName || s.evaluatorEmail, status: s.status, total: s.total, recommendation: s.recommendation || "", flags: s.flags || [], weight: weights.get(String(s.evaluator)) || 0 })) }];
  }));
};

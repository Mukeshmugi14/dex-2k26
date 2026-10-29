import mongoose from "mongoose";
import Registration from "../models/Registration.js";
import Round2Evaluation from "../models/Round2Evaluation.js";
import { evaluatorWeights, scoreFromSheets } from "./rubricScores.js";

// A team's Round 2 score works exactly like Round 1: the weighted average of its panel's submitted prototype sheets
// (each evaluator's scoreWeight), final once the highest-weight panel member has submitted. Stored on the team as
// round2Evaluation so admin pages read one number.
export const refreshTeamRound2Score = async (registrationId) => {
  const id = new mongoose.Types.ObjectId(String(registrationId));
  const [team, sheets, weights] = await Promise.all([
    Registration.findById(id, "evaluationPanel").lean(),
    Round2Evaluation.find({ registration: id }, "evaluator status total").lean(),
    evaluatorWeights(),
  ]);
  const score = scoreFromSheets(sheets, team?.evaluationPanel, weights);
  const set = { "round2Evaluation.evaluatorCount": score.count, "round2Evaluation.scoreComplete": score.complete };
  await Registration.updateOne({ _id: id }, score.average === null
    ? { $set: set, $unset: { "round2Evaluation.totalScore": "", "round2Evaluation.scoreSpread": "" } }
    : { $set: { ...set, "round2Evaluation.totalScore": score.average, "round2Evaluation.scoreSpread": score.spread, "round2Evaluation.evaluatedAt": new Date() } });
  return score;
};

/** Map(registrationId → { average, count, complete, spread, sheets[] }) for admin lists. */
export const round2Summaries = async (teams) => {
  const ids = teams.map((t) => t._id);
  const [sheets, weights] = await Promise.all([
    Round2Evaluation.find({ registration: { $in: ids } }, "registration evaluator evaluatorName evaluatorEmail status total recommendation flags").lean(),
    evaluatorWeights(),
  ]);
  const byTeam = new Map();
  for (const s of sheets) byTeam.set(String(s.registration), [...(byTeam.get(String(s.registration)) || []), s]);
  return new Map(teams.map((t) => {
    const list = byTeam.get(String(t._id)) || [];
    const score = scoreFromSheets(list, t.evaluationPanel, weights);
    return [String(t._id), { ...score, sheets: list.map((s) => ({ evaluator: s.evaluatorName || s.evaluatorEmail, status: s.status, total: s.total, recommendation: s.recommendation || "", flags: s.flags || [], weight: weights.has(String(s.evaluator)) ? weights.get(String(s.evaluator)) : 1 })) }];
  }));
};

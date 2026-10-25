import mongoose from "mongoose";
import Registration from "../models/Registration.js";
import RubricEvaluation from "../models/RubricEvaluation.js";
import Evaluator from "../models/Evaluator.js";

// Every Round 1 PPT is scored by a panel of PANEL_SIZE evaluators. The team's final score (out of 100) is the
// weighted average of the panel's submitted sheets (each evaluator's scoreWeight: 0 = not counted, 2 = double),
// and it counts as final once every panel member with a weight above 0 has submitted.
export const PANEL_SIZE = Math.max(1, Number.parseInt(process.env.EVALUATORS_PER_PPT, 10) || 3);
// Panels whose highest and lowest totals differ by more than this are flagged for the organisers to review.
export const SPREAD_ALERT = 20;

const round1 = (value) => Math.round(value * 10) / 10;

/** weight of an evaluator (Map evaluatorId → weight; missing = 1). */
const weightOf = (weights, id) => (weights?.has(String(id)) ? weights.get(String(id)) : 1);

/** Submitted sheets that count for a team: by its panel (or any, if it has no panel yet) and with a weight above 0. */
const countedSheets = (sheets, panel, weights) => {
  const members = new Set((panel || []).map(String));
  return sheets.filter((s) => s.status === "submitted" && (!members.size || members.has(String(s.evaluator))) && weightOf(weights, s.evaluator) > 0);
};

export const scoreFromSheets = (sheets, panel, weights = new Map()) => {
  const counted = countedSheets(sheets, panel, weights);
  // Final once every weighted panel member has submitted (a panel without members needs PANEL_SIZE sheets).
  const weighted = (panel || []).map(String).filter((id) => weightOf(weights, id) > 0);
  const needed = (panel || []).length ? weighted.length : PANEL_SIZE;
  if (!counted.length) return { average: null, count: 0, needed, complete: false, spread: null };
  const totals = counted.map((s) => s.total || 0);
  const weightSum = counted.reduce((a, s) => a + weightOf(weights, s.evaluator), 0);
  return {
    average: round1(counted.reduce((a, s) => a + (s.total || 0) * weightOf(weights, s.evaluator), 0) / weightSum),
    count: counted.length,
    needed,
    complete: needed > 0 && counted.length >= needed,
    spread: round1(Math.max(...totals) - Math.min(...totals)),
  };
};

/** Map(evaluatorId → scoreWeight) for every evaluator. */
export const evaluatorWeights = async () => new Map((await Evaluator.find({}, "scoreWeight").lean()).map((e) => [String(e._id), Number.isFinite(e.scoreWeight) ? e.scoreWeight : 1]));

// Stores the team's current score on the team (evaluation.totalScore etc.) so admin lists, Round Selection and,
// once released, the Team Portal all read the same number.
export const refreshTeamRubricScore = async (registrationId) => {
  const id = new mongoose.Types.ObjectId(String(registrationId));
  const [team, sheets, weights] = await Promise.all([
    Registration.findById(id, "evaluationPanel").lean(),
    RubricEvaluation.find({ registration: id }, "evaluator status total").lean(),
    evaluatorWeights(),
  ]);
  const score = scoreFromSheets(sheets, team?.evaluationPanel, weights);
  const set = { "evaluation.evaluatorCount": score.count, "evaluation.scoreComplete": score.complete };
  if (score.average === null) {
    await Registration.updateOne({ _id: id }, { $set: set, $unset: { "evaluation.totalScore": "", "evaluation.scoreSpread": "" } });
  } else {
    await Registration.updateOne({ _id: id }, { $set: { ...set, "evaluation.totalScore": score.average, "evaluation.scoreSpread": score.spread, "evaluation.evaluatedAt": new Date() } });
  }
  return score;
};

/** Recalculates every team that has a sheet (after an evaluator's weight changes). */
export const refreshAllRubricScores = async () => {
  const ids = await RubricEvaluation.distinct("registration");
  for (const id of ids) await refreshTeamRubricScore(id);
  return ids.length;
};

/** Per-team summary for admin lists: Map(registrationId → { count, drafts, average, complete, spread, sheets[] }). */
export const rubricSummaries = async (registrationIds, panels = new Map()) => {
  const [sheets, weights] = await Promise.all([
    RubricEvaluation.find({ registration: { $in: registrationIds } }, "registration evaluator evaluatorName evaluatorEmail status total recommendation policyFlags submittedAt updatedAt").lean(),
    evaluatorWeights(),
  ]);
  const byTeam = new Map();
  for (const s of sheets) byTeam.set(String(s.registration), [...(byTeam.get(String(s.registration)) || []), s]);
  const out = new Map();
  for (const id of registrationIds.map(String)) {
    const list = byTeam.get(id) || [];
    const panel = panels.get(id) || [];
    const score = scoreFromSheets(list, panel, weights);
    const members = new Set(panel.map(String));
    out.set(id, {
      ...score,
      panelSize: score.needed || PANEL_SIZE,
      drafts: list.filter((s) => s.status === "draft" && (!members.size || members.has(String(s.evaluator)))).length,
      sheets: list.map((s) => ({ evaluatorId: String(s.evaluator), evaluator: s.evaluatorName || s.evaluatorEmail, email: s.evaluatorEmail, status: s.status, total: s.total, recommendation: s.recommendation || "", policyFlags: s.policyFlags || [], submittedAt: s.submittedAt || null, updatedAt: s.updatedAt, onPanel: !members.size || members.has(String(s.evaluator)), weight: weightOf(weights, s.evaluator) })),
    });
  }
  return out;
};

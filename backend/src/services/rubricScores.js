import mongoose from "mongoose";
import Registration from "../models/Registration.js";
import RubricEvaluation from "../models/RubricEvaluation.js";

// Every Round 1 PPT is scored by a panel of PANEL_SIZE evaluators. The team's final score (out of 100) is the
// average of the panel's submitted sheets, and it counts as final once all of them are in.
export const PANEL_SIZE = Math.max(1, Number.parseInt(process.env.EVALUATORS_PER_PPT, 10) || 3);
// Panels whose highest and lowest totals differ by more than this are flagged for the organisers to review.
export const SPREAD_ALERT = 20;

const round1 = (value) => Math.round(value * 10) / 10;

/** Submitted sheets that count for a team: those by its panel (or every submitted sheet if it has no panel yet). */
const countedSheets = (sheets, panel) => {
  const members = new Set((panel || []).map(String));
  return sheets.filter((s) => s.status === "submitted" && (!members.size || members.has(String(s.evaluator))));
};

export const scoreFromSheets = (sheets, panel) => {
  const counted = countedSheets(sheets, panel);
  if (!counted.length) return { average: null, count: 0, complete: false, spread: null };
  const totals = counted.map((s) => s.total || 0);
  return {
    average: round1(totals.reduce((a, b) => a + b, 0) / totals.length),
    count: counted.length,
    complete: counted.length >= PANEL_SIZE,
    spread: round1(Math.max(...totals) - Math.min(...totals)),
  };
};

// Stores the team's current score on the team (evaluation.totalScore etc.) so admin lists, Round Selection and,
// once released, the Team Portal all read the same number.
export const refreshTeamRubricScore = async (registrationId) => {
  const id = new mongoose.Types.ObjectId(String(registrationId));
  const [team, sheets] = await Promise.all([
    Registration.findById(id, "evaluationPanel").lean(),
    RubricEvaluation.find({ registration: id }, "evaluator status total").lean(),
  ]);
  const score = scoreFromSheets(sheets, team?.evaluationPanel);
  const set = { "evaluation.evaluatorCount": score.count, "evaluation.scoreComplete": score.complete };
  if (score.average === null) {
    await Registration.updateOne({ _id: id }, { $set: set, $unset: { "evaluation.totalScore": "", "evaluation.scoreSpread": "" } });
  } else {
    await Registration.updateOne({ _id: id }, { $set: { ...set, "evaluation.totalScore": score.average, "evaluation.scoreSpread": score.spread, "evaluation.evaluatedAt": new Date() } });
  }
  return score;
};

/** Per-team summary for admin lists: Map(registrationId → { count, drafts, average, complete, spread, sheets[] }). */
export const rubricSummaries = async (registrationIds, panels = new Map()) => {
  const sheets = await RubricEvaluation.find({ registration: { $in: registrationIds } }, "registration evaluator evaluatorName evaluatorEmail status total recommendation policyFlags submittedAt updatedAt").lean();
  const byTeam = new Map();
  for (const s of sheets) byTeam.set(String(s.registration), [...(byTeam.get(String(s.registration)) || []), s]);
  const out = new Map();
  for (const id of registrationIds.map(String)) {
    const list = byTeam.get(id) || [];
    const panel = panels.get(id) || [];
    const score = scoreFromSheets(list, panel);
    const members = new Set(panel.map(String));
    out.set(id, {
      ...score,
      panelSize: PANEL_SIZE,
      drafts: list.filter((s) => s.status === "draft" && (!members.size || members.has(String(s.evaluator)))).length,
      sheets: list.map((s) => ({ evaluatorId: String(s.evaluator), evaluator: s.evaluatorName || s.evaluatorEmail, email: s.evaluatorEmail, status: s.status, total: s.total, recommendation: s.recommendation || "", policyFlags: s.policyFlags || [], submittedAt: s.submittedAt || null, updatedAt: s.updatedAt, onPanel: !members.size || members.has(String(s.evaluator)) })),
    });
  }
  return out;
};

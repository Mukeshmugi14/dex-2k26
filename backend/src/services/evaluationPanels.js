import mongoose from "mongoose";
import Evaluator from "../models/Evaluator.js";
import Registration from "../models/Registration.js";
import RubricEvaluation from "../models/RubricEvaluation.js";
import { PANEL_SIZE, refreshTeamRubricScore } from "./rubricScores.js";

// Round 1 evaluation panels: every team with a PDF gets PANEL_SIZE (3) different evaluators, spread so each
// evaluator has about the same number of PPTs. Running it again only fills gaps: existing panel members stay
// (unless they were disabled and haven't submitted), so nobody loses work already done.

const TEAMS_WITH_PDF = { "pdfSubmission.fileId": { $ne: null } };

/** Pure planner (tested separately): returns Map(teamId → evaluatorIds[]) for the teams whose panel changes. */
export const planPanels = (teams, evaluatorIds, submittedBy = new Map(), size = PANEL_SIZE) => {
  const active = evaluatorIds.map(String);
  const activeSet = new Set(active);
  const load = new Map(active.map((id) => [id, 0]));
  const panels = new Map();
  // Keep current members that are active, or that already submitted for this team.
  for (const t of teams) {
    const done = submittedBy.get(String(t._id)) || new Set();
    const kept = [...new Set((t.evaluationPanel || []).map(String))].filter((id) => activeSet.has(id) || done.has(id)).slice(0, Math.max(size, done.size));
    panels.set(String(t._id), kept);
    kept.forEach((id) => load.has(id) && load.set(id, load.get(id) + 1));
  }
  const changed = new Map();
  for (const t of teams) {
    const key = String(t._id);
    const before = (t.evaluationPanel || []).map(String);
    const panel = panels.get(key);
    while (panel.length < size) {
      // Least-loaded active evaluator not already on this panel; ties broken by a stable order.
      const pick = active.filter((id) => !panel.includes(id)).sort((a, b) => load.get(a) - load.get(b) || a.localeCompare(b))[0];
      if (!pick) break;
      panel.push(pick);
      load.set(pick, load.get(pick) + 1);
    }
    if (panel.length !== before.length || panel.some((id, i) => id !== before[i])) changed.set(key, panel);
  }
  return changed;
};

const submittedMap = async (teamIds) => {
  const sheets = await RubricEvaluation.find({ registration: { $in: teamIds }, status: "submitted" }, "registration evaluator").lean();
  const map = new Map();
  for (const s of sheets) { const k = String(s.registration); if (!map.has(k)) map.set(k, new Set()); map.get(k).add(String(s.evaluator)); }
  return map;
};

/** Assigns/fills every team's panel. Returns a summary for the admin. */
export const assignPanels = async () => {
  const [evaluators, teams] = await Promise.all([
    Evaluator.find({ active: { $ne: false } }, "_id").sort({ createdAt: 1 }).lean(),
    Registration.find(TEAMS_WITH_PDF, "_id teamId evaluationPanel").sort({ teamId: 1 }).lean(),
  ]);
  const changed = planPanels(teams, evaluators.map((e) => e._id), await submittedMap(teams.map((t) => t._id)));
  if (changed.size) {
    await Registration.bulkWrite([...changed].map(([id, panel]) => ({ updateOne: { filter: { _id: id }, update: { $set: { evaluationPanel: panel.map((p) => new mongoose.Types.ObjectId(p)), evaluationPanelAt: new Date() } } } })), { ordered: false });
    for (const id of changed.keys()) await refreshTeamRubricScore(id);
  }
  const after = await Registration.find(TEAMS_WITH_PDF, "evaluationPanel").lean();
  return {
    panelSize: PANEL_SIZE,
    evaluators: evaluators.length,
    teams: after.length,
    updated: changed.size,
    fullPanels: after.filter((t) => (t.evaluationPanel || []).length >= PANEL_SIZE).length,
    shortPanels: after.filter((t) => (t.evaluationPanel || []).length < PANEL_SIZE).length,
  };
};

/** Admin sets one team's panel by hand. A member who already submitted can't be removed (their score counts). */
export const setTeamPanel = async (teamId, evaluatorIds) => {
  const ids = [...new Set((evaluatorIds || []).map(String))].filter(mongoose.isValidObjectId);
  if (ids.length > PANEL_SIZE) return { error: `A panel has at most ${PANEL_SIZE} evaluators.` };
  const team = await Registration.findOne({ _id: teamId, ...TEAMS_WITH_PDF }, "evaluationPanel").lean();
  if (!team) return { error: "Team not found or no PDF submitted.", status: 404 };
  const valid = await Evaluator.countDocuments({ _id: { $in: ids }, active: { $ne: false } });
  if (valid !== ids.length) return { error: "Choose active evaluators only." };
  const done = (await submittedMap([team._id])).get(String(team._id)) || new Set();
  const dropped = [...done].filter((id) => !ids.includes(id));
  if (dropped.length) return { error: "An evaluator who has already submitted this team's sheet can't be removed from its panel." };
  await Registration.updateOne({ _id: team._id }, { $set: { evaluationPanel: ids.map((id) => new mongoose.Types.ObjectId(id)), evaluationPanelAt: new Date() } });
  await refreshTeamRubricScore(team._id);
  return { ok: true };
};

/** Map(evaluatorId → number of teams assigned). */
export const panelLoads = async () => {
  const rows = await Registration.aggregate([{ $match: TEAMS_WITH_PDF }, { $unwind: "$evaluationPanel" }, { $group: { _id: "$evaluationPanel", n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
};

import mongoose from "mongoose";
import Evaluator from "../models/Evaluator.js";
import RubricEvaluation from "../models/RubricEvaluation.js";
import { sendEvaluatorInviteEmail } from "../services/emailService.js";
import { getEvaluatorLoginUrl } from "../services/submissionService.js";
import { rubricView } from "../services/rubric.js";
import Registration from "../models/Registration.js";
import { assignPanels, panelLoads, setTeamPanel } from "../services/evaluationPanels.js";
import { PANEL_SIZE, rubricSummaries, SPREAD_ALERT } from "../services/rubricScores.js";
import { createCollegeLookup } from "../services/collegeRegistry.js";

// Admin → Evaluators: who may sign in to the Evaluator Portal. Admins never see or set evaluator passwords;
// each evaluator sets their own after a one-time code sent to their email.
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
const view = (e, counts) => ({
  id: String(e._id), email: e.email, name: e.name || "", active: e.active !== false,
  passwordSet: Boolean(e.passwordSetAt), passwordSetAt: e.passwordSetAt || null, lastLoginAt: e.lastLoginAt || null, createdAt: e.createdAt,
  submitted: counts.get(`${e._id}:submitted`) || 0, drafts: counts.get(`${e._id}:draft`) || 0,
  assigned: counts.get(`${e._id}:assigned`) || 0,
});

export const listEvaluators = async (_request, response) => {
  const [evaluators, grouped] = await Promise.all([
    Evaluator.find({}).sort({ active: -1, createdAt: 1 }).lean(),
    RubricEvaluation.aggregate([{ $group: { _id: { e: "$evaluator", s: "$status" }, n: { $sum: 1 } } }]),
  ]);
  const counts = new Map(grouped.map((g) => [`${g._id.e}:${g._id.s}`, g.n]));
  for (const [id, n] of await panelLoads()) counts.set(`${id}:assigned`, n);
  const teams = await Registration.find({ "pdfSubmission.fileId": { $ne: null } }, "evaluationPanel evaluation.scoreComplete").lean();
  const coverage = {
    panelSize: PANEL_SIZE,
    teams: teams.length,
    fullPanels: teams.filter((t) => (t.evaluationPanel || []).length >= PANEL_SIZE).length,
    unassigned: teams.filter((t) => !(t.evaluationPanel || []).length).length,
    finalScores: teams.filter((t) => t.evaluation?.scoreComplete).length,
  };
  return response.json({ evaluators: evaluators.map((e) => view(e, counts)), portalUrl: getEvaluatorLoginUrl(), coverage });
};

export const addEvaluator = async (request, response) => {
  const email = String(request.body?.email || "").trim().toLowerCase();
  const name = String(request.body?.name || "").trim().slice(0, 80);
  if (!isEmail(email)) return response.status(400).json({ message: "Enter a valid email address.", errors: { email: "Enter a valid email address." } });
  if (!name) return response.status(400).json({ message: "Enter the evaluator's name.", errors: { name: "Enter the evaluator's name." } });
  if (await Evaluator.exists({ email })) return response.status(409).json({ message: "This email is already an evaluator.", errors: { email: "Already an evaluator." } });
  const evaluator = await Evaluator.create({ email, name, createdBy: request.admin?.username || "admin" });
  console.log(`EVALUATOR_ADDED ${email} by ${request.admin?.username || "?"}`);
  let invite = { sent: false };
  if (request.body?.sendInvite !== false) {
    try { await sendEvaluatorInviteEmail(email, name); invite = { sent: true }; } catch (error) { invite = { sent: false, error: error.code || error.message }; }
  }
  return response.status(201).json({ message: `${name} added.${invite.sent ? ` Invitation emailed to ${email}.` : request.body?.sendInvite === false ? "" : " The invitation email could not be sent; use Resend invite."}`, evaluator: view(evaluator.toObject(), new Map()), invite });
};

const findEvaluator = (id) => (mongoose.isValidObjectId(id) ? Evaluator.findById(id) : null);

// Name / active. Deactivating ends the evaluator's sessions at once.
export const updateEvaluator = async (request, response) => {
  const evaluator = await findEvaluator(request.params.id);
  if (!evaluator) return response.status(404).json({ message: "Evaluator not found." });
  if (typeof request.body?.name === "string" && request.body.name.trim()) evaluator.name = request.body.name.trim().slice(0, 80);
  if (typeof request.body?.active === "boolean" && request.body.active !== evaluator.active) {
    evaluator.active = request.body.active;
    evaluator.sessionVersion = (evaluator.sessionVersion || 0) + 1;
  }
  await evaluator.save();
  console.log(`EVALUATOR_UPDATED ${evaluator.email} active=${evaluator.active} by ${request.admin?.username || "?"}`);
  // A disabled evaluator's unfinished teams go to the others, so every PPT still gets its full panel.
  let note = "";
  if (!evaluator.active && (await Registration.exists({ evaluationPanel: evaluator._id })) && (await Evaluator.countDocuments({ active: { $ne: false } })) >= PANEL_SIZE) {
    const summary = await assignPanels();
    note = summary.updated ? ` Their unfinished PPTs were reassigned (${summary.fullPanels} of ${summary.teams} panels full).` : "";
  }
  return response.json({ message: `${evaluator.name || evaluator.email} updated.${note}` });
};

// Clears the password so the evaluator must set a new one with a one-time code; ends their sessions.
export const resetEvaluatorPassword = async (request, response) => {
  const evaluator = await findEvaluator(request.params.id);
  if (!evaluator) return response.status(404).json({ message: "Evaluator not found." });
  await Evaluator.updateOne({ _id: evaluator._id }, { $unset: { passwordHash: "", passwordSetAt: "", otp: "" }, $inc: { sessionVersion: 1 } });
  console.log(`EVALUATOR_PASSWORD_RESET ${evaluator.email} by ${request.admin?.username || "?"}`);
  return response.json({ message: `${evaluator.name || evaluator.email} must set a new password with a one-time code at next sign-in.` });
};

export const resendEvaluatorInvite = async (request, response) => {
  const evaluator = await findEvaluator(request.params.id);
  if (!evaluator || !evaluator.active) return response.status(404).json({ message: "Active evaluator not found." });
  try { await sendEvaluatorInviteEmail(evaluator.email, evaluator.name); } catch { return response.status(502).json({ message: "The invitation email could not be sent. Try again." }); }
  return response.json({ message: `Invitation emailed to ${evaluator.email}.` });
};

// Every evaluator's full sheet for one team (admin review).
export const getTeamEvaluationSheets = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Team not found." });
  const sheets = await RubricEvaluation.find({ registration: request.params.id }).sort({ status: -1, submittedAt: 1 }).lean();
  return response.json({
    rubric: rubricView(),
    sheets: sheets.map((s) => ({
      evaluator: s.evaluatorName || s.evaluatorEmail, email: s.evaluatorEmail, status: s.status, total: s.total, submittedAt: s.submittedAt || null, updatedAt: s.updatedAt,
      projectTitle: s.projectTitle || "", psCategory: s.psCategory || "", panel: s.panel || "", checks: s.checks || {}, policyFlags: s.policyFlags || [], policyNote: s.policyNote || "",
      levels: s.levels || {}, comments: s.comments || {}, strengths: s.strengths || [], improvements: s.improvements || [], recommendation: s.recommendation || "", coiDeclared: Boolean(s.coiDeclared),
    })),
  });
};

// Gives every team with a PDF a panel of 3 evaluators (fills gaps only; existing members keep their teams).
export const assignEvaluatorPanels = async (request, response) => {
  // Each PPT needs PANEL_SIZE different evaluators, so don't hand out partial panels.
  const active = await Evaluator.countDocuments({ active: { $ne: false } });
  if (active < PANEL_SIZE) return response.status(400).json({ message: `Add at least ${PANEL_SIZE} active evaluators first: each PPT needs ${PANEL_SIZE} different evaluators (you have ${active}).` });
  const summary = await assignPanels();
  console.log(`EVALUATOR_PANELS_ASSIGNED by ${request.admin?.username || "?"} ${JSON.stringify(summary)}`);
  return response.json({ ...summary, message: `Panels ready: ${summary.fullPanels} of ${summary.teams} PPTs have ${summary.panelSize} evaluators${summary.updated ? ` (${summary.updated} updated)` : ""}.` });
};

// Sets one team's panel by hand (e.g. to replace an evaluator with a conflict of interest).
export const updateTeamPanel = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Team not found." });
  const result = await setTeamPanel(request.params.id, request.body?.evaluatorIds);
  if (result.error) return response.status(result.status || 400).json({ message: result.error });
  console.log(`EVALUATOR_PANEL_SET ${request.params.id} by ${request.admin?.username || "?"}`);
  return response.json({ message: "Panel updated." });
};

// Round 1 shortlist: every team with a PDF ranked by its final score (average of its panel's sheets, out of 100).
export const getShortlist = async (_request, response) => {
  const teams = await Registration.find({ "pdfSubmission.fileId": { $ne: null } }, "teamId teamName college collegeName collegeId collegeNameRaw projectTheme leader.name evaluationPanel roundResults.round1.status excludeFromCount").lean();
  const panels = new Map(teams.map((t) => [String(t._id), (t.evaluationPanel || []).map(String)]));
  const summaries = await rubricSummaries(teams.map((t) => t._id), panels);
  const lookup = await createCollegeLookup();
  const rows = teams.map((t) => {
    const s = summaries.get(String(t._id));
    const counted = s.sheets.filter((x) => x.status === "submitted" && x.onPanel);
    const recs = counted.reduce((m, x) => (x.recommendation ? { ...m, [x.recommendation]: (m[x.recommendation] || 0) + 1 } : m), {});
    const college = lookup.forTeam(t);
    return {
      id: String(t._id), teamId: t.teamId, teamName: t.teamName, teamHead: t.leader?.name || "",
      college: college.collegeId ? college.name : (t.college || t.collegeName || ""), theme: t.projectTheme || "",
      score: s.average, count: s.count, panel: panels.get(String(t._id)).length, panelSize: PANEL_SIZE, complete: s.complete,
      spread: s.spread, disagreement: s.spread !== null && s.spread > SPREAD_ALERT,
      scores: counted.map((x) => x.total), recommendations: recs,
      policyFlags: [...new Set(counted.flatMap((x) => x.policyFlags))],
      round1: t.roundResults?.round1?.status || "PENDING",
      notCounted: Boolean(t.excludeFromCount),
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.teamId.localeCompare(b.teamId));
  let rank = 0;
  rows.forEach((r, i) => { if (r.score !== null) r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : (rank = i + 1); });
  return response.json({ panelSize: PANEL_SIZE, spreadAlert: SPREAD_ALERT, teams: rows });
};

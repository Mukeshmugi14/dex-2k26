import mongoose from "mongoose";
import Evaluator from "../models/Evaluator.js";
import RubricEvaluation from "../models/RubricEvaluation.js";
import { sendEvaluatorInviteEmail } from "../services/emailService.js";
import { getEvaluatorLoginUrl } from "../services/submissionService.js";
import { rubricView } from "../services/rubric.js";

// Admin → Evaluators: who may sign in to the Evaluator Portal. Admins never see or set evaluator passwords;
// each evaluator sets their own after a one-time code sent to their email.
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
const view = (e, counts) => ({
  id: String(e._id), email: e.email, name: e.name || "", active: e.active !== false,
  passwordSet: Boolean(e.passwordSetAt), passwordSetAt: e.passwordSetAt || null, lastLoginAt: e.lastLoginAt || null, createdAt: e.createdAt,
  submitted: counts.get(`${e._id}:submitted`) || 0, drafts: counts.get(`${e._id}:draft`) || 0,
});

export const listEvaluators = async (_request, response) => {
  const [evaluators, grouped] = await Promise.all([
    Evaluator.find({}).sort({ active: -1, createdAt: 1 }).lean(),
    RubricEvaluation.aggregate([{ $group: { _id: { e: "$evaluator", s: "$status" }, n: { $sum: 1 } } }]),
  ]);
  const counts = new Map(grouped.map((g) => [`${g._id.e}:${g._id.s}`, g.n]));
  return response.json({ evaluators: evaluators.map((e) => view(e, counts)), portalUrl: getEvaluatorLoginUrl() });
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
  return response.json({ message: `${evaluator.name || evaluator.email} updated.` });
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

import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";
import Evaluator from "../models/Evaluator.js";
import Registration from "../models/Registration.js";
import RubricEvaluation from "../models/RubricEvaluation.js";
import { sendEvaluatorCodeEmail } from "../services/emailService.js";
import {
  EVAL_OTP_MAX_ATTEMPTS, EVAL_OTP_RESEND_MS, EVAL_OTP_TTL_MS, EVAL_SECRET_MESSAGE, evaluatorOtpMatches, evaluatorPasswordProblem,
  evaluatorSecretConfigured, generateEvaluatorOtp, hashEvaluatorOtp, signCodeChallenge, signEvaluatorSession, verifyCodeChallenge,
} from "../services/evaluatorAuth.js";
import { clearFailures, clientIp, lockedMinutes, recordFailure } from "../services/adminSecurity.js";
import { cleanSheet, RUBRIC_VERSION, rubricView } from "../services/rubric.js";
import { createCollegeLookup } from "../services/collegeRegistry.js";
import { openPdfStream } from "../services/submissionService.js";
import { teamStudyInfo } from "../services/teamProfile.js";
import { refreshTeamRubricScore } from "../services/rubricScores.js";

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
const cleanEmail = (value) => String(value || "").trim().toLowerCase();
// Lockout keys are prefixed so evaluator failures never lock admin logins (and vice versa).
const keysFor = (request, email) => [`eval-ip:${clientIp(request)}`, ...(email ? [`eval-acct:${email}`] : [])];
const lockedReply = (minutes) => ({ success: false, locked: true, message: `Too many failed attempts. Evaluator sign-in is locked for ${minutes} minute${minutes === 1 ? "" : "s"}. Try again later.` });
const BAD_LOGIN = { success: false, message: "Incorrect email or password." };
// A bcrypt hash of a random value, so unknown emails take as long as wrong passwords (made once, on first use).
let dummyHash = null;
const getDummyHash = async () => (dummyHash ||= await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 12));
const sessionReply = (evaluator) => ({ success: true, token: signEvaluatorSession(evaluator), evaluator: { email: evaluator.email, name: evaluator.name || "" } });

// --- Sign in -------------------------------------------------------------------------------------------------

export const evaluatorLogin = async (request, response) => {
  if (!evaluatorSecretConfigured()) return response.status(503).json({ success: false, message: EVAL_SECRET_MESSAGE });
  const email = cleanEmail(request.body?.email);
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const keys = keysFor(request, email);
  const locked = await lockedMinutes(keys);
  if (locked) return response.status(429).json(lockedReply(locked));
  if (!isEmail(email) || !password) return response.status(400).json({ success: false, message: "Enter your email and password." });

  const evaluator = await Evaluator.findOne({ email }).select("+passwordHash").lean();
  const ok = await bcrypt.compare(password, evaluator?.passwordHash || (await getDummyHash()));
  if (!evaluator || evaluator.active === false || !evaluator.passwordHash || !ok) {
    const nowLocked = await recordFailure(keys);
    console.log(`EVALUATOR_LOGIN_FAILED ${email} ip=${clientIp(request)}`);
    if (nowLocked) return response.status(429).json(lockedReply(15));
    // A registered evaluator who hasn't set a password yet gets a hint (only after the correct-email check).
    if (evaluator && evaluator.active !== false && !evaluator.passwordHash) return response.status(401).json({ success: false, needsSetup: true, message: "You haven't set a password yet. Choose \"First time / Forgot password\" to get a one-time code." });
    return response.status(401).json(BAD_LOGIN);
  }
  await clearFailures([`eval-acct:${email}`]);
  await Evaluator.updateOne({ _id: evaluator._id }, { $set: { lastLoginAt: new Date() } });
  console.log(`EVALUATOR_LOGIN ${email} ip=${clientIp(request)}`);
  return response.json(sessionReply(evaluator));
};

// First time / forgot password: emails a one-time code if (and only if) the email belongs to an active evaluator.
// The reply is the same either way, so the form can't be used to find out who the evaluators are.
export const requestEvaluatorCode = async (request, response) => {
  if (!evaluatorSecretConfigured()) return response.status(503).json({ success: false, message: EVAL_SECRET_MESSAGE });
  const email = cleanEmail(request.body?.email);
  if (!isEmail(email)) return response.status(400).json({ success: false, message: "Enter a valid email address." });
  const keys = keysFor(request, email);
  const locked = await lockedMinutes(keys);
  if (locked) return response.status(429).json(lockedReply(locked));

  const reply = { success: true, challenge: signCodeChallenge(email), message: "If this email is registered as an evaluator, a one-time code has been sent to it. It expires in 10 minutes." };
  const evaluator = await Evaluator.findOne({ email, active: { $ne: false } }).select("+otp").lean();
  if (!evaluator) { await recordFailure([`eval-ip:${clientIp(request)}`]); return response.json(reply); }
  const lastSent = evaluator.otp?.sentAt ? new Date(evaluator.otp.sentAt).getTime() : 0;
  if (Date.now() - lastSent < EVAL_OTP_RESEND_MS) {
    const wait = Math.ceil((EVAL_OTP_RESEND_MS - (Date.now() - lastSent)) / 1000);
    return response.status(429).json({ success: false, message: `Please wait ${wait} seconds before asking for another code.` });
  }
  const code = generateEvaluatorOtp();
  await Evaluator.updateOne({ _id: evaluator._id }, { $set: { otp: { hash: hashEvaluatorOtp(evaluator._id, code), expiresAt: new Date(Date.now() + EVAL_OTP_TTL_MS), attempts: 0, sentAt: new Date() } } });
  try {
    await sendEvaluatorCodeEmail(email, code, EVAL_OTP_TTL_MS / 60000);
  } catch {
    await Evaluator.updateOne({ _id: evaluator._id }, { $unset: { otp: "" } });
    return response.status(502).json({ success: false, message: "We couldn't send the code email right now. Please try again in a minute." });
  }
  console.log(`EVALUATOR_CODE_SENT ${email} ip=${clientIp(request)}`);
  return response.json(reply);
};

// Verifies the one-time code and sets the evaluator's password, then signs them in.
export const setEvaluatorPassword = async (request, response) => {
  if (!evaluatorSecretConfigured()) return response.status(503).json({ success: false, message: EVAL_SECRET_MESSAGE });
  const email = verifyCodeChallenge(request.body?.challenge);
  if (!email) return response.status(401).json({ success: false, expired: true, message: "This code request has expired. Ask for a new code." });
  const keys = keysFor(request, email);
  const locked = await lockedMinutes(keys);
  if (locked) return response.status(429).json(lockedReply(locked));

  const code = String(request.body?.code || "").trim();
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const problem = evaluatorPasswordProblem(password, email);
  if (problem) return response.status(400).json({ success: false, errors: { password: problem }, message: problem });

  const evaluator = await Evaluator.findOne({ email, active: { $ne: false } }).select("+otp").lean();
  const otp = evaluator?.otp;
  const fresh = otp?.hash && otp.expiresAt && new Date(otp.expiresAt).getTime() > Date.now() && (otp.attempts || 0) < EVAL_OTP_MAX_ATTEMPTS;
  if (!evaluator || !fresh || !evaluatorOtpMatches(evaluator._id, code, otp.hash)) {
    if (evaluator && otp?.hash) await Evaluator.updateOne({ _id: evaluator._id }, { $inc: { "otp.attempts": 1 } });
    const nowLocked = await recordFailure(keys);
    if (nowLocked) return response.status(429).json(lockedReply(15));
    const used = evaluator && otp?.hash ? (otp.attempts || 0) + 1 : EVAL_OTP_MAX_ATTEMPTS;
    return response.status(401).json({ success: false, errors: { code: "Incorrect or expired code." }, message: used >= EVAL_OTP_MAX_ATTEMPTS ? "This code can't be used any more. Ask for a new code." : "Incorrect or expired code." });
  }
  // Single use: the code is removed in the same update that sets the password; old sessions end.
  const updated = await Evaluator.findOneAndUpdate(
    { _id: evaluator._id, "otp.hash": otp.hash },
    { $set: { passwordHash: await bcrypt.hash(password, 12), passwordSetAt: new Date(), lastLoginAt: new Date() }, $unset: { otp: "" }, $inc: { sessionVersion: 1 } },
    { new: true },
  ).lean();
  if (!updated) return response.status(409).json({ success: false, message: "This code was already used. Ask for a new code." });
  await clearFailures([`eval-acct:${email}`]);
  console.log(`EVALUATOR_PASSWORD_SET ${email} ip=${clientIp(request)}`);
  return response.json({ ...sessionReply(updated), message: "Password set. You're signed in." });
};

// --- Portal ----------------------------------------------------------------------------------------------------

export const getEvaluatorMe = async (request, response) => response.json({ success: true, evaluator: { email: request.evaluator.email, name: request.evaluator.name } });
export const getEvaluatorRubric = async (_request, response) => response.json({ success: true, rubric: rubricView() });

const isLocked = (team) => team?.evaluation?.result && team.evaluation.result !== "Pending";

// Teams with a Round 1 PDF, with only what judging needs (no contact details) and this evaluator's own progress.
export const listEvaluatorTeams = async (request, response) => {
  const teams = await Registration.find({ "pdfSubmission.fileId": { $ne: null } }, "teamId teamName college collegeName collegeId collegeNameRaw projectTheme year department members.year members.department pdfSubmission.fileName pdfSubmission.fileSize pdfSubmission.submittedAt evaluation.result").sort({ teamId: 1 }).lean();
  const mine = new Map((await RubricEvaluation.find({ evaluator: request.evaluator.id }, "registration status total updatedAt submittedAt").lean()).map((e) => [String(e.registration), e]));
  const lookup = await createCollegeLookup();
  return response.json({
    success: true,
    teams: teams.map((t) => {
      const e = mine.get(String(t._id));
      const college = lookup.forTeam(t);
      return {
        id: String(t._id), teamId: t.teamId, teamName: t.teamName,
        college: college.collegeId ? college.name : (t.college || t.collegeName || ""),
        theme: t.projectTheme || "", ...teamStudyInfo(t),
        fileName: t.pdfSubmission?.fileName || "", fileSize: t.pdfSubmission?.fileSize || 0, submittedAt: t.pdfSubmission?.submittedAt || null,
        myStatus: e?.status || "not-started", myTotal: e ? e.total : null, myUpdatedAt: e?.updatedAt || null,
        locked: isLocked(t),
      };
    }),
  });
};

const findTeam = async (id, fields) => (mongoose.isValidObjectId(id) ? Registration.findOne({ _id: id, "pdfSubmission.fileId": { $ne: null } }, fields).lean() : null);

// The PDF in parts (HTTP Range), so large files stay under the hosting platform's response size limit.
const MAX_CHUNK = 3 * 1024 * 1024;
export const streamEvaluatorPdf = async (request, response) => {
  const team = await findTeam(request.params.id, "teamId pdfSubmission");
  if (!team) return response.status(404).json({ success: false, message: "No PDF has been submitted for this team." });
  const size = team.pdfSubmission.fileSize || 0;
  const match = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range || ""));
  const start = match ? Number(match[1]) : 0;
  const end = Math.min(match && match[2] ? Number(match[2]) : start + MAX_CHUNK - 1, start + MAX_CHUNK - 1, size - 1);
  if (!size || start >= size || end < start) return response.status(416).setHeader("Content-Range", `bytes */${size}`).end();
  response.status(206);
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  response.setHeader("Content-Length", String(end - start + 1));
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("X-File-Size", String(size));
  // Let the portal read these when it calls the API from another origin (e.g. local development).
  response.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, X-File-Size");
  response.setHeader("Cache-Control", "private, no-store");
  openPdfStream(team.pdfSubmission.fileId, { start, end: end + 1 })
    .on("error", (error) => { console.error("Evaluator PDF stream error:", error.message); if (!response.headersSent) response.status(404).end(); else response.end(); })
    .pipe(response);
};

const sheetView = (e) => (e ? {
  status: e.status, total: e.total, submittedAt: e.submittedAt || null, updatedAt: e.updatedAt,
  projectTitle: e.projectTitle || "", psCategory: e.psCategory || "", panel: e.panel || "",
  checks: e.checks || {}, policyFlags: e.policyFlags || [], policyNote: e.policyNote || "",
  levels: Object.fromEntries(e.levels instanceof Map ? e.levels : Object.entries(e.levels || {})),
  comments: Object.fromEntries(e.comments instanceof Map ? e.comments : Object.entries(e.comments || {})),
  strengths: e.strengths || [], improvements: e.improvements || [], recommendation: e.recommendation || "", coiDeclared: Boolean(e.coiDeclared),
} : null);

export const getEvaluatorSheet = async (request, response) => {
  const team = await findTeam(request.params.id, "teamId teamName college collegeName collegeId collegeNameRaw projectTheme year department members.year members.department pdfSubmission.fileName pdfSubmission.fileSize pdfSubmission.submittedAt evaluation.result");
  if (!team) return response.status(404).json({ success: false, message: "Team not found or no PDF submitted." });
  const sheet = await RubricEvaluation.findOne({ registration: team._id, evaluator: request.evaluator.id }).lean();
  const lookup = await createCollegeLookup();
  const college = lookup.forTeam(team);
  return response.json({
    success: true,
    team: { id: String(team._id), teamId: team.teamId, teamName: team.teamName, college: college.collegeId ? college.name : (team.college || team.collegeName || ""), theme: team.projectTheme || "", ...teamStudyInfo(team), fileName: team.pdfSubmission.fileName, fileSize: team.pdfSubmission.fileSize || 0, submittedAt: team.pdfSubmission.submittedAt, locked: isLocked(team) },
    sheet: sheetView(sheet),
  });
};

// Saves this evaluator's sheet as a draft, or submits it (all paper-sheet rules enforced). Locked once the
// organisers have decided the team's Round 1 result.
export const saveEvaluatorSheet = async (request, response) => {
  const team = await findTeam(request.params.id, "teamId evaluation.result");
  if (!team) return response.status(404).json({ success: false, message: "Team not found or no PDF submitted." });
  if (isLocked(team)) return response.status(403).json({ success: false, locked: true, message: "The organisers have already decided this team's Round 1 result, so its evaluation can no longer be changed." });
  const submit = request.body?.submit === true;
  const { value, errors } = cleanSheet(request.body, { submit });
  if (Object.keys(errors).length) return response.status(400).json({ success: false, message: "Please complete the highlighted fields.", errors });

  const existing = await RubricEvaluation.findOne({ registration: team._id, evaluator: request.evaluator.id }, "status").lean();
  const status = submit || existing?.status === "submitted" ? "submitted" : "draft";
  if (!submit && existing?.status === "submitted") {
    // Editing a submitted sheet must keep it complete.
    const check = cleanSheet(request.body, { submit: true });
    if (Object.keys(check.errors).length) return response.status(400).json({ success: false, message: "This sheet is already submitted; keep every required field filled.", errors: check.errors });
  }
  const firstSubmit = status === "submitted" && existing?.status !== "submitted";
  const sheet = await RubricEvaluation.findOneAndUpdate(
    { registration: team._id, evaluator: request.evaluator.id },
    { $set: { ...value, teamId: team.teamId, evaluatorEmail: request.evaluator.email, evaluatorName: request.evaluator.name, rubricVersion: RUBRIC_VERSION, status, ...(firstSubmit ? { submittedAt: new Date() } : {}) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  if (status === "submitted") await refreshTeamRubricScore(team._id);
  console.log(`EVALUATOR_SHEET_${firstSubmit ? "SUBMITTED" : status === "submitted" ? "UPDATED" : "DRAFT"} ${team.teamId} by ${request.evaluator.email} total=${value.total}`);
  return response.json({ success: true, message: firstSubmit ? "Evaluation submitted. Thank you!" : status === "submitted" ? "Submitted evaluation updated." : "Draft saved.", sheet: sheetView(sheet) });
};

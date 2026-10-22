import mongoose from "mongoose";
import EvaluationSettings from "../models/EvaluationSettings.js";
import Registration, { EVALUATION_RESULTS } from "../models/Registration.js";
import { sendSelectionEmail } from "../services/emailService.js";
import { deriveSubmissionStatus, openPdfStream } from "../services/submissionService.js";
import { STUDY_FIELDS, teamStudyInfo } from "../services/teamProfile.js";
import { PANEL_SIZE, refreshTeamRubricScore, rubricSummaries, SPREAD_ALERT } from "../services/rubricScores.js";
import Evaluator from "../models/Evaluator.js";

const CRITERIA = ["criterion1", "criterion2", "criterion3", "criterion4"];
const LIST_FIELDS = `teamId teamName leader college collegeName projectTheme pdfSubmission evaluation selectionEmailSent selectionEmailStatus selectionEmailSentAt createdAt evaluationPanel ${STUDY_FIELDS}`;

const getSettings = async () => (await EvaluationSettings.findOne()) || new EvaluationSettings();
const settingsView = (settings) => ({ maxScorePerCriterion: settings.maxScorePerCriterion ?? null, criteriaLabels: settings.criteriaLabels });

const toAdminView = (registration) => {
  const view = registration.toObject ? registration.toObject() : { ...registration };
  view.pdfSubmission = { ...(view.pdfSubmission || {}), status: deriveSubmissionStatus(registration), hasPdf: Boolean(view.pdfSubmission?.fileId) };
  delete view.pdfSubmission.tokenHash;
  delete view.pdfSubmission.legacyTokenHash;
  delete view.pdfSubmission.linkSalt;
  view.evaluation = { result: "Pending", ...(view.evaluation || {}) };
  Object.assign(view, { study: teamStudyInfo(view) });
  delete view.members;
  return view;
};

// Adds each team's evaluation panel (names + whether each member has submitted) and its score summary.
export const withRubric = async (registrations) => {
  const panels = new Map(registrations.map((r) => [String(r._id), (r.evaluationPanel || []).map(String)]));
  const summaries = await rubricSummaries(registrations.map((r) => r._id), panels);
  const ids = [...new Set([...panels.values()].flat())];
  const names = new Map((await Evaluator.find({ _id: { $in: ids } }, "name email active").lean()).map((e) => [String(e._id), e]));
  return registrations.map((r) => {
    const summary = summaries.get(String(r._id));
    const panel = panels.get(String(r._id)).map((id) => {
      const e = names.get(id);
      const sheet = summary.sheets.find((s) => s.evaluatorId === id);
      return { id, name: e?.name || e?.email || "Removed evaluator", email: e?.email || "", active: e?.active !== false, status: sheet?.status || "not-started", total: sheet?.status === "submitted" ? sheet.total : null };
    });
    const view = toAdminView(r);
    delete view.evaluationPanel;
    return { ...view, panel, rubric: summary };
  });
};

const findRegistration = async (id) => (mongoose.isValidObjectId(id) ? Registration.findById(id) : null);

// All registered/imported teams and their submission/evaluation state.
export const listSubmissions = async (_request, response) => {
  const [registrations, settings] = await Promise.all([
    Registration.find({}, LIST_FIELDS).sort({ "pdfSubmission.submittedAt": -1, createdAt: -1 }).lean(),
    getSettings(),
  ]);
  // Evaluator Portal scores (PPT Evaluation Sheet, out of 100): each team's panel and the average of its sheets.
  const teams = await withRubric(registrations);
  const evaluators = (await Evaluator.find({ active: { $ne: false } }, "name email").sort({ name: 1 }).lean()).map((e) => ({ id: String(e._id), name: e.name || e.email, email: e.email }));
  return response.json({ teams, evaluators, panelSize: PANEL_SIZE, spreadAlert: SPREAD_ALERT, settings: settingsView(settings) });
};

// Streams the PDF only to authenticated admins (this router is behind requireAdmin).
export const streamSubmissionPdf = async (request, response) => {
  const registration = await findRegistration(request.params.id);
  if (!registration?.pdfSubmission?.fileId) return response.status(404).json({ success: false, message: "No PDF has been submitted for this team." });
  const fileName = registration.pdfSubmission.fileName || "submission.pdf";
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `${request.query.download ? "attachment" : "inline"}; filename="${fileName.replace(/"/g, "")}"`);
  response.setHeader("Cache-Control", "private, no-store");
  openPdfStream(registration.pdfSubmission.fileId)
    .on("error", (error) => {
      console.error("PDF stream error:", error.message);
      if (!response.headersSent) response.status(404).json({ success: false, message: "The PDF file could not be found." });
      else response.end();
    })
    .pipe(response);
};

export const getEvaluationSettings = async (_request, response) => response.json(settingsView(await getSettings()));

export const updateEvaluationSettings = async (request, response) => {
  const max = Number(request.body.maxScorePerCriterion);
  const labels = Array.isArray(request.body.criteriaLabels) ? request.body.criteriaLabels.map((value) => (typeof value === "string" ? value.trim() : "")) : [];
  if (!Number.isFinite(max) || max < 1 || max > 1000) return response.status(400).json({ success: false, message: "Maximum score per criterion must be a number from 1 to 1000." });
  if (labels.length !== 4 || labels.some((value) => !value || value.length > 60)) return response.status(400).json({ success: false, message: "Provide a name (up to 60 characters) for each of the 4 criteria." });

  const [highest] = await Registration.aggregate([{ $project: { top: { $max: CRITERIA.map((key) => `$evaluation.${key}`) } } }, { $group: { _id: null, top: { $max: "$top" } } }]);
  if (highest?.top > max) return response.status(400).json({ success: false, message: `Some teams already have a criterion score of ${highest.top}. The maximum cannot be lower than that.` });

  const settings = await getSettings();
  settings.maxScorePerCriterion = max;
  settings.criteriaLabels = labels;
  await settings.save();
  return response.json({ success: true, message: "Evaluation settings saved.", settings: settingsView(settings) });
};

export const saveEvaluation = async (request, response) => {
  const registration = await findRegistration(request.params.id);
  if (!registration) return response.status(404).json({ success: false, message: "Registration not found." });
  if (!registration.pdfSubmission?.fileId) return response.status(400).json({ success: false, message: "This team has not submitted a PDF yet." });

  // Scores come from the evaluators' PPT Evaluation Sheets (Evaluator Portal); the admin decides the result.
  const { result } = request.body;
  if (!EVALUATION_RESULTS.includes(result)) return response.status(400).json({ success: false, message: "Please correct the highlighted fields.", errors: { result: "Choose a result." } });

  await refreshTeamRubricScore(registration._id);
  const fresh = await Registration.findById(registration._id, "evaluation").lean();
  registration.evaluation.totalScore = fresh.evaluation?.totalScore;
  registration.evaluation.evaluatorCount = fresh.evaluation?.evaluatorCount || 0;
  registration.evaluation.result = result;
  registration.evaluation.evaluatedAt = new Date();
  registration.evaluation.evaluatedBy = request.admin?.username || "admin";
  registration.pdfSubmission.status = deriveSubmissionStatus(registration);
  await registration.save();

  // Only "Selected" triggers the second-round email, and only if it has not been sent before.
  const email = result === "Selected" ? await sendSelectionEmailOnce(registration._id) : { attempted: false, sent: false };
  const updated = await Registration.findById(registration._id);
  const emailMessage = !email.attempted ? "" : email.sent ? ` Second round email sent to ${updated.leader?.email}.` : " Selection saved, but email could not be sent.";
  const [view] = await withRubric([updated.toObject()]);
  return response.json({ success: true, message: `Result saved.${emailMessage}`, email, registration: view });
};

// Sends the Selected email at most once. An atomic claim (status "Sending") stops two parallel saves from both sending.
const SENDING_TIMEOUT_MS = 2 * 60 * 1000;
const sendSelectionEmailOnce = async (registrationId) => {
  const claimed = await Registration.findOneAndUpdate(
    {
      _id: registrationId,
      "evaluation.result": "Selected",
      selectionEmailSent: { $ne: true },
      $or: [{ selectionEmailStatus: { $ne: "Sending" } }, { selectionEmailAttemptAt: { $lt: new Date(Date.now() - SENDING_TIMEOUT_MS) } }],
    },
    { $set: { selectionEmailStatus: "Sending", selectionEmailAttemptAt: new Date() } },
    { new: true },
  );
  if (!claimed) return { attempted: false, sent: false };

  let sent = false;
  try {
    sent = await sendSelectionEmail(claimed);
  } catch (error) {
    console.error("Second Round Email Error:", error);
  }
  await Registration.updateOne({ _id: registrationId }, sent
    ? { $set: { selectionEmailSent: true, selectionEmailStatus: "Sent", selectionEmailSentAt: new Date() } }
    : { $set: { selectionEmailStatus: "Failed" } });
  return { attempted: true, sent };
};

// Retry a failed Selected email without changing the score or result.
export const retrySelectionEmail = async (request, response) => {
  const registration = await findRegistration(request.params.id);
  if (!registration) return response.status(404).json({ success: false, message: "Registration not found." });
  if (registration.evaluation?.result !== "Selected") return response.status(400).json({ success: false, message: "Only selected teams receive the second round email." });
  if (registration.selectionEmailSent) return response.json({ success: true, message: "Second round email was already sent.", registration: toAdminView(registration) });

  const email = await sendSelectionEmailOnce(registration._id);
  const updated = await Registration.findById(registration._id);
  if (!email.attempted) return response.status(409).json({ success: false, message: "The email is already being sent. Please wait a moment.", registration: toAdminView(updated) });
  return response.status(email.sent ? 200 : 502).json({ success: email.sent, message: email.sent ? `Second round email sent to ${updated.leader?.email}.` : "Email could not be sent. Please try again.", registration: toAdminView(updated) });
};

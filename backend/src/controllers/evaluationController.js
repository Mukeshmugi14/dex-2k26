import mongoose from "mongoose";
import EvaluationSettings from "../models/EvaluationSettings.js";
import Registration, { EVALUATION_RESULTS } from "../models/Registration.js";
import { sendSelectionEmail } from "../services/emailService.js";
import { deriveSubmissionStatus, openPdfStream } from "../services/submissionService.js";

const CRITERIA = ["criterion1", "criterion2", "criterion3", "criterion4"];
const LIST_FIELDS = "teamId teamName leader college collegeName projectTheme payment.status payment.confirmedAt payment.confirmationEmailStatus pdfSubmission evaluation selectionEmailSent selectionEmailStatus selectionEmailSentAt createdAt";

const getSettings = async () => (await EvaluationSettings.findOne()) || new EvaluationSettings();
const settingsView = (settings) => ({ maxScorePerCriterion: settings.maxScorePerCriterion ?? null, criteriaLabels: settings.criteriaLabels });

const toAdminView = (registration) => {
  const view = registration.toObject ? registration.toObject() : { ...registration };
  view.pdfSubmission = { ...(view.pdfSubmission || {}), status: deriveSubmissionStatus(registration), hasPdf: Boolean(view.pdfSubmission?.fileId) };
  delete view.pdfSubmission.tokenHash;
  delete view.pdfSubmission.legacyTokenHash;
  delete view.pdfSubmission.linkSalt;
  view.evaluation = { result: "Pending", ...(view.evaluation || {}) };
  return view;
};

const findRegistration = async (id) => (mongoose.isValidObjectId(id) ? Registration.findById(id) : null);

// Teams that have received a submission link (payment confirmed) or have already submitted a PDF.
export const listSubmissions = async (_request, response) => {
  const [registrations, settings] = await Promise.all([
    Registration.find({ $or: [{ "payment.confirmedAt": { $exists: true, $ne: null } }, { "pdfSubmission.fileId": { $exists: true, $ne: null } }] }, LIST_FIELDS).sort({ "pdfSubmission.submittedAt": -1, createdAt: -1 }).lean(),
    getSettings(),
  ]);
  return response.json({ teams: registrations.map(toAdminView), settings: settingsView(settings) });
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

  const settings = await getSettings();
  const max = settings.maxScorePerCriterion;
  if (!max) return response.status(400).json({ success: false, message: "Set the maximum score per criterion before evaluating." });

  const { scores, result } = request.body;
  const errors = {};
  const values = CRITERIA.map((key, index) => {
    const raw = Array.isArray(scores) ? scores[index] : undefined;
    const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < 0 || value > max) errors[key] = `Enter a score from 0 to ${max}.`;
    else if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) errors[key] = "Use at most 2 decimal places.";
    return value;
  });
  if (!EVALUATION_RESULTS.includes(result)) errors.result = "Choose a result.";
  if (Object.keys(errors).length) return response.status(400).json({ success: false, message: "Please correct the highlighted fields.", errors });

  CRITERIA.forEach((key, index) => { registration.evaluation[key] = values[index]; });
  registration.evaluation.totalScore = Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
  registration.evaluation.result = result;
  registration.evaluation.evaluatedAt = new Date();
  registration.evaluation.evaluatedBy = request.admin?.username || "admin";
  registration.pdfSubmission.status = deriveSubmissionStatus(registration);
  await registration.save();

  // Only "Selected" triggers the second-round email, and only if it has not been sent before.
  const email = result === "Selected" ? await sendSelectionEmailOnce(registration._id) : { attempted: false, sent: false };
  const updated = await Registration.findById(registration._id);
  const emailMessage = !email.attempted ? "" : email.sent ? ` Second round email sent to ${updated.leader?.email}.` : " Selection saved, but email could not be sent.";
  return response.json({ success: true, message: `Evaluation saved successfully.${emailMessage}`, email, registration: toAdminView(updated) });
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

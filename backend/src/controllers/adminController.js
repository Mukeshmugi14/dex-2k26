import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../models/Admin.js";
import Registration from "../models/Registration.js";
import { sendPaymentConfirmationEmail } from "../services/emailService.js";
import { buildSubmissionUrl, issueSubmissionToken } from "../services/submissionService.js";

export const login = async (request, response) => {
  const { username, password } = request.body;
  const admin = await Admin.findOne({ username });
  if (!admin || !(await bcrypt.compare(password || "", admin.passwordHash))) {
    return response.status(401).json({ success: false, message: "Invalid username or password" });
  }
  return response.json({ success: true, token: jwt.sign({ id: admin.id, username: admin.username }, process.env.JWT_SECRET, { expiresIn: "8h" }), admin: { username: admin.username } });
};

// ---------- Admin lists: computed in MongoDB, paginated, and never carrying the (large) team logos ----------

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const searchFilter = (search, fields) => {
  const term = typeof search === "string" ? search.trim().slice(0, 100) : "";
  if (!term) return {};
  const pattern = new RegExp(escapeRegex(term), "i");
  return { $or: fields.map((field) => ({ [field]: pattern })) };
};
const pageParams = (query, defaultLimit = 20) => {
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || defaultLimit, 1), 100);
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  return { page, limit, skip: (page - 1) * limit };
};
const SECRET_FIELDS = { "pdfSubmission.tokenHash": 0, "pdfSubmission.legacyTokenHash": 0, "pdfSubmission.linkSalt": 0 };
const paymentCategory = {
  success: { "payment.status": "Successful" },
  failed: { "payment.status": "Failed" },
  pending: { "payment.status": { $nin: ["Successful", "Failed"] } },
  confirmed: { "payment.confirmedAt": { $ne: null } },
  "not-confirmed": { "payment.confirmedAt": null },
};

export const getDashboard = async (_request, response) => {
  const [stats = {}] = await Registration.aggregate([
    { $group: {
      _id: null,
      total: { $sum: 1 },
      participants: { $sum: { $size: { $ifNull: ["$members", []] } } },
      faculty: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$mentor.name", ""] } }, 0] }, 1, 0] } },
      successful: { $sum: { $cond: [{ $and: [{ $eq: ["$payment.status", "Successful"] }, { $ne: [{ $ifNull: ["$payment.confirmedAt", null] }, null] }] }, 1, 0] } },
      amount: { $sum: { $cond: [{ $and: [{ $eq: ["$payment.status", "Successful"] }, { $ne: [{ $ifNull: ["$payment.confirmedAt", null] }, null] }] }, { $ifNull: ["$payment.amount", 0] }, 0] } },
      pending: { $sum: { $cond: [{ $in: ["$payment.status", ["Successful", "Failed"]] }, 0, 1] } },
      failed: { $sum: { $cond: [{ $eq: ["$payment.status", "Failed"] }, 1, 0] } },
    } },
  ]);
  return response.json({
    totalRegistrations: stats.total || 0,
    totalTeams: stats.total || 0,
    totalParticipants: stats.participants || 0,
    totalFacultyRegistrations: stats.faculty || 0,
    totalAmount: stats.amount || 0,
    successfulPayments: stats.successful || 0,
    pendingPayments: stats.pending || 0,
    failedPayments: stats.failed || 0,
  });
};

// Paginated team/registration list. Logos are replaced by a hasLogo flag (served lazily by /api/registrations/:id/logo),
// except for ?all=1&includeLogos=1 which the A4 print view uses.
export const getRegistrations = async (request, response) => {
  const { query } = request;
  const filters = [searchFilter(query.search, ["teamName", "teamId", "registrationNumber", "leader.name", "leader.email", "college", "payment.transactionId"])];
  if (query.college === "sathyabama") filters.push({ college: /^sathyabama institute of science and technology$/i });
  else if (query.college === "other") filters.push({ college: { $not: /^sathyabama institute of science and technology$/i } });
  else if (query.college && query.college !== "all") filters.push({ college: String(query.college) });
  if (paymentCategory[query.status]) filters.push(paymentCategory[query.status]);
  const match = { $and: filters };

  const all = query.all === "1";
  const includeLogos = all && query.includeLogos === "1";
  const { page, limit, skip } = all ? { page: 1, limit: 2000, skip: 0 } : pageParams(query);
  const projection = includeLogos ? SECRET_FIELDS : { ...SECRET_FIELDS, teamLogo: 0 };

  const [result] = await Registration.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $facet: {
      items: [{ $skip: skip }, { $limit: limit }, { $addFields: { hasLogo: { $gt: [{ $strLenBytes: { $ifNull: ["$teamLogo", ""] } }, 0] } } }, { $project: projection }],
      total: [{ $count: "n" }],
    } },
  ]);
  const total = result.total[0]?.n || 0;
  return response.json({ items: result.items, total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) });
};

export const getColleges = async (_request, response) => {
  const colleges = (await Registration.distinct("college")).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return response.json({ colleges });
};

const PAYMENT_FIELDS = { teamId: 1, teamName: 1, college: 1, "leader.name": 1, "leader.email": 1, payment: 1, createdAt: 1 };

// Paginated, server-filtered payment history with whole-collection summary totals.
export const getPayments = async (request, response) => {
  const { query } = request;
  const { page, limit, skip } = pageParams(query);
  const filters = [searchFilter(query.search, ["teamName", "teamId", "leader.name", "college", "payment.transactionId"])];
  if (paymentCategory[query.status]) filters.push(paymentCategory[query.status]);
  const match = { $and: filters };

  const [[summary = {}], items, total] = await Promise.all([
    Registration.aggregate([{ $group: {
      _id: null,
      total: { $sum: 1 },
      successful: { $sum: { $cond: [{ $eq: ["$payment.status", "Successful"] }, 1, 0] } },
      failed: { $sum: { $cond: [{ $eq: ["$payment.status", "Failed"] }, 1, 0] } },
      amount: { $sum: { $cond: [{ $eq: ["$payment.status", "Successful"] }, { $ifNull: ["$payment.amount", 0] }, 0] } },
    } }]),
    Registration.find(match, PAYMENT_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Registration.countDocuments(match),
  ]);
  return response.json({
    items, total, page, limit, pages: Math.max(Math.ceil(total / limit), 1),
    summary: { total: summary.total || 0, successful: summary.successful || 0, failed: summary.failed || 0, pending: (summary.total || 0) - (summary.successful || 0) - (summary.failed || 0), amount: summary.amount || 0 },
  });
};
export const getFaculty = async (_request, response) => response.json(await Registration.find({ "mentor.name": { $ne: "" } }, "mentor college teamName createdAt"));

const MAX_LOGO_LENGTH = 1_500_000;

// List-shaped team record: the (large) logo is replaced by a hasLogo flag; it is fetched separately when shown.
export const toListItem = (doc) => {
  const { teamLogo, ...rest } = doc.toJSON ? doc.toJSON() : doc;
  return { ...rest, hasLogo: Boolean(teamLogo) };
};
const SATHYABAMA = "sathyabama institute of science and technology";

// College is stored in two fields plus a type; keep all three consistent.
export const setCollege = (registration, college) => {
  registration.college = college;
  registration.collegeName = college;
  registration.collegeType = college.toLowerCase() === SATHYABAMA ? "sathyabama" : "other";
};
const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

// Edits the team details of an existing registration in place; IDs and payment data are never touched.
export const updateRegistration = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ success: false, message: "Registration not found." });
  const registration = await Registration.findById(request.params.id);
  if (!registration) return response.status(404).json({ success: false, message: "Registration not found." });

  const { teamName, leader = {}, members, logo } = request.body;
  const errors = {};
  const nextTeamName = cleanText(teamName);
  const nextLeader = { name: cleanText(leader.name), email: cleanText(leader.email).toLowerCase(), phone: cleanText(leader.phone) };
  if (!nextTeamName) errors.teamName = "Team name is required.";
  if (!nextLeader.name) errors.leaderName = "Team head name is required.";
  if (!/^\S+@\S+\.\S+$/.test(nextLeader.email)) errors.leaderEmail = "Enter a valid email address.";
  if (!nextLeader.phone) errors.leaderPhone = "Phone number is required.";
  if (!Array.isArray(members) || members.length !== registration.members.length) {
    errors.members = "Member list does not match this team.";
  } else {
    members.forEach((member, index) => { if (!cleanText(member?.name)) errors[`member-${index}`] = "Member name is required."; });
  }
  const nextCollege = request.body.college === undefined ? undefined : cleanText(request.body.college);
  if (nextCollege !== undefined && !nextCollege) errors.college = "College is required.";
  if (logo !== undefined && logo !== null && logo !== "") {
    if (typeof logo !== "string" || !/^data:image\/(png|jpeg);base64,/.test(logo)) errors.logo = "Logo must be a PNG or JPG image.";
    else if (logo.length > MAX_LOGO_LENGTH) errors.logo = "Logo image is too large.";
  }
  if (Object.keys(errors).length) return response.status(400).json({ success: false, message: "Please correct the highlighted fields.", errors });

  registration.teamName = nextTeamName;
  registration.leader.name = nextLeader.name;
  registration.leader.email = nextLeader.email;
  registration.leader.phone = nextLeader.phone;
  members.forEach((member, index) => { registration.members[index].name = cleanText(member.name); });
  if (nextCollege !== undefined) setCollege(registration, nextCollege);
  if (logo) registration.teamLogo = logo;
  await registration.save();

  return response.json({ success: true, message: "Team details updated successfully.", registration: toListItem(registration) });
};

// ---------- Payment confirmation: fast database update, confirmation email in the background ----------

const EMAIL_SENDING_TIMEOUT_MS = 2 * 60 * 1000;

// Sends the confirmation email after the HTTP response has gone out, then records Sent/Failed on the payment.
const sendConfirmationEmailInBackground = (registrationId) => {
  setImmediate(async () => {
    let sent = false;
    let recipient = null;
    try {
      const registration = await Registration.findById(registrationId);
      recipient = registration?.leader?.email || null;
      console.log(`Starting payment confirmation email for ${registrationId} to ${recipient || "missing recipient"}.`);
      // Every confirmation email (including resends) carries the team's one permanent PDF submission link.
      const submissionToken = await issueSubmissionToken(registrationId);
      sent = await sendPaymentConfirmationEmail(registration, { submissionUrl: buildSubmissionUrl(submissionToken) });
      console.log(`Payment confirmation email ${sent ? "sent" : "not accepted"} for ${registrationId}.`);
    } catch (error) {
      console.error("Confirmation Email Error:", { registrationId: String(registrationId), recipient, code: error.code || null, responseCode: error.responseCode || null, message: error.message });
    }
    await Registration.updateOne({ _id: registrationId }, sent
      ? { $set: { "payment.confirmationEmailStatus": "Sent", "payment.confirmationEmailSentAt": new Date() } }
      : { $set: { "payment.confirmationEmailStatus": "Failed" } }).catch((error) => console.error("Unable to record confirmation email status:", error.message));
  });
};

// A "Sending" status that never finished (e.g. the server restarted mid-send) is reported as Failed so it can be resent.
const effectiveEmailStatus = (payment) => (payment?.confirmationEmailStatus === "Sending" && payment.confirmationEmailAttemptAt && Date.now() - new Date(payment.confirmationEmailAttemptAt).getTime() > EMAIL_SENDING_TIMEOUT_MS
  ? "Failed" : payment?.confirmationEmailStatus || "Not Sent");

const paymentRow = (doc) => {
  const row = doc.toObject ? doc.toObject() : doc;
  return { ...row, payment: { ...row.payment, confirmationEmailStatus: effectiveEmailStatus(row.payment) } };
};

export const confirmPayment = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Registration not found." });
  const now = new Date();
  // One atomic update: only an unconfirmed payment with a transaction ID can be confirmed (also makes double clicks harmless).
  const confirmed = await Registration.findOneAndUpdate(
    { _id: request.params.id, "payment.confirmedAt": null, "payment.transactionId": { $nin: [null, ""] } },
    { $set: { "payment.status": "Successful", "payment.confirmedAt": now, "payment.confirmedBy": request.admin.username, "payment.confirmationEmailStatus": "Sending", "payment.confirmationEmailAttemptAt": now } },
    { new: true, projection: PAYMENT_FIELDS, lean: true },
  );

  if (!confirmed) {
    const existing = await Registration.findById(request.params.id, PAYMENT_FIELDS).lean();
    if (!existing) return response.status(404).json({ message: "Registration not found." });
    if (existing.payment?.confirmedAt) return response.json({ success: true, alreadyConfirmed: true, paymentConfirmed: true, message: "Payment was already confirmed.", registration: paymentRow(existing) });
    return response.status(400).json({ message: "A transaction ID is required before confirming payment." });
  }

  console.log(`Payment confirmed successfully for ${confirmed._id}.`);
  response.json({ success: true, paymentConfirmed: true, emailStatus: "Sending", message: "Payment confirmed successfully. Sending the confirmation email…", registration: paymentRow(confirmed) });
  sendConfirmationEmailInBackground(confirmed._id);
};

export const resendPaymentConfirmationEmail = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Registration not found." });
  const now = new Date();
  const queued = await Registration.findOneAndUpdate(
    {
      _id: request.params.id,
      "payment.confirmedAt": { $ne: null },
      $or: [{ "payment.confirmationEmailStatus": { $ne: "Sending" } }, { "payment.confirmationEmailAttemptAt": { $lt: new Date(now.getTime() - EMAIL_SENDING_TIMEOUT_MS) } }],
    },
    { $set: { "payment.confirmationEmailStatus": "Sending", "payment.confirmationEmailAttemptAt": now } },
    { new: true, projection: PAYMENT_FIELDS, lean: true },
  );
  if (!queued) {
    const existing = await Registration.findById(request.params.id, PAYMENT_FIELDS).lean();
    if (!existing) return response.status(404).json({ message: "Registration not found." });
    if (!existing.payment?.confirmedAt) return response.status(400).json({ message: "Confirm the payment before sending its confirmation email." });
    return response.status(409).json({ message: "The confirmation email is already being sent.", registration: paymentRow(existing) });
  }
  response.json({ success: true, paymentConfirmed: true, emailStatus: "Sending", message: "Sending the confirmation email…", registration: paymentRow(queued) });
  sendConfirmationEmailInBackground(queued._id);
};

// Lightweight poll target for one row's email status (used only while that row shows "Sending").
export const getPaymentEmailStatus = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Registration not found." });
  const row = await Registration.findById(request.params.id, { "payment.confirmationEmailStatus": 1, "payment.confirmationEmailSentAt": 1, "payment.confirmationEmailAttemptAt": 1 }).lean();
  if (!row) return response.status(404).json({ message: "Registration not found." });
  return response.json({ confirmationEmailStatus: effectiveEmailStatus(row.payment), confirmationEmailSentAt: row.payment?.confirmationEmailSentAt || null });
};

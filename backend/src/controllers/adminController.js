import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../models/Admin.js";
import Registration from "../models/Registration.js";
import { adminProfile } from "../services/adminAccess.js";
import {
  describeEmailError,
  emailProvider,
  getEmailHealth,
  markEmailHealthy,
  previewTeamConfirmationEmail,
  resetEmailHealth,
  sendAdminLoginAlertEmail,
  sendAdminOtpEmail,
  sendTeamConfirmationEmail,
  sendTestEmail,
} from "../services/emailService.js";
import { generateOtp, hashOtp, isEmail, maskEmail, OTP_MAX_ATTEMPTS, OTP_RESEND_MS, OTP_TTL_MS, otpMatches, passwordProblem, signChallenge, verifyChallenge } from "../services/adminOtpService.js";
import { processSpreadsheetImport } from "../services/spreadsheetImportService.js";
import { adminJwtSecret, clearFailures, LOCK_MS, clientAgent, clientIp, lockedMinutes, lockedResponse, recordFailure, throttleKeys, WEAK_SECRET_MESSAGE } from "../services/adminSecurity.js";

const INVALID_ADMIN_LOGIN = { success: false, message: "Invalid Gmail address or password" };
// Admin sessions last at most 2 hours (the admin pages also log out after 30 minutes without activity).
const ADMIN_SESSION = "2h";
const RESTART = "Please enter your Gmail again to get a new code.";

const adminGmail = (admin) => (isEmail(admin?.email) ? admin.email : isEmail(admin?.username) ? admin.username : "");
const findAdminByGmail = (gmail) => Admin.findOne({ $or: [{ email: gmail }, { username: gmail }] }).select("+otp");

// Emails a fresh 4-digit code for this purpose, or reuses one sent in the last 30 seconds (so repeated clicks
// don't flood the inbox). Returns { reused } or throws when the email can't be sent.
const sendCode = async (admin, purpose) => {
  const otp = admin.otp;
  const fresh = otp?.purpose === purpose && otp.sentAt && Date.now() - new Date(otp.sentAt).getTime() < OTP_RESEND_MS && new Date(otp.expiresAt).getTime() > Date.now();
  if (fresh) return { reused: true };
  const code = generateOtp();
  await Admin.updateOne({ _id: admin._id }, { $set: { otp: { hash: hashOtp(admin._id, code), purpose, expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, sentAt: new Date() } } });
  try {
    await sendAdminOtpEmail(adminGmail(admin), code, OTP_TTL_MS / 60000, purpose);
  } catch (error) {
    await Admin.updateOne({ _id: admin._id }, { $unset: { otp: "" } });
    throw error;
  }
  return { reused: false };
};

// Checks a code for this purpose. Returns { admin, keys } when it is right; otherwise sends the error response
// and returns null. Wrong codes count toward the per-code limit (5) and the per-account/IP lockout.
const checkCode = async (request, response, purpose) => {
  if (!adminJwtSecret()) { response.status(503).json({ success: false, restart: true, message: WEAK_SECRET_MESSAGE }); return null; }
  const adminId = verifyChallenge(request.body.challenge, purpose);
  const code = typeof request.body.code === "string" ? request.body.code.trim() : "";
  // Unknown Gmail addresses get a challenge for no account, so they end here exactly like an expired code.
  if (!adminId || !mongoose.isValidObjectId(adminId)) { response.status(401).json({ success: false, restart: true, message: `The code expired or is not valid. ${RESTART}` }); return null; }
  const admin = await Admin.findById(adminId).select("+otp");
  const keys = throttleKeys(clientIp(request), adminGmail(admin));
  const lockedFor = await lockedMinutes(keys);
  if (lockedFor) { response.status(429).json({ ...lockedResponse(lockedFor), restart: true }); return null; }
  if (!admin || admin.active === false || !admin.otp?.hash || (admin.otp.purpose || "login") !== purpose) { response.status(401).json({ success: false, restart: true, message: `The code expired or is not valid. ${RESTART}` }); return null; }
  if (new Date(admin.otp.expiresAt).getTime() < Date.now() || (admin.otp.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    await Admin.updateOne({ _id: admin._id }, { $unset: { otp: "" } });
    response.status(401).json({ success: false, restart: true, message: `The code expired or had too many wrong tries. ${RESTART}` });
    return null;
  }
  if (!otpMatches(admin._id, code, admin.otp.hash)) {
    // Count the attempt atomically; parallel guesses can't get extra tries.
    const updated = await Admin.findOneAndUpdate({ _id: admin._id, "otp.hash": admin.otp.hash }, { $inc: { "otp.attempts": 1 } }, { new: true }).select("+otp");
    const left = Math.max(0, OTP_MAX_ATTEMPTS - (updated?.otp?.attempts ?? OTP_MAX_ATTEMPTS));
    const nowLocked = await recordFailure(keys);
    console.warn(`Wrong admin ${purpose} code for ${admin.username} from ${clientIp(request)} (${left} tries left)${nowLocked ? " (now locked)" : ""}.`);
    if (nowLocked || !left) await Admin.updateOne({ _id: admin._id }, { $unset: { otp: "" } });
    if (nowLocked) response.status(429).json({ ...lockedResponse(LOCK_MS / 60000), restart: true });
    else response.status(401).json({ success: false, restart: !left, message: left ? `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.` : `Too many wrong codes. ${RESTART}` });
    return null;
  }
  return { admin, keys };
};

// Ends a successful login: uses up the code (single use), clears lockout counters, emails a login alert and
// returns the admin session. `extra` is applied in the same update (e.g. the new password hash).
const finishLogin = async (request, response, { admin, keys }, extra = {}, alertNote = "") => {
  const used = await Admin.updateOne({ _id: admin._id, "otp.hash": admin.otp.hash }, { $unset: { otp: "" }, $set: { lastLoginAt: new Date(), ...extra } });
  if (!used.modifiedCount) return response.status(401).json({ success: false, restart: true, message: `This code was already used. ${RESTART}` });
  await clearFailures(keys);
  const when = `${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" })} IST`;
  console.log(`Admin login: ${admin.username} from ${clientIp(request)}${alertNote ? ` (${alertNote})` : ""}.`);
  // A failed alert never blocks the login.
  sendAdminLoginAlertEmail(adminGmail(admin), { when, ip: clientIp(request), agent: clientAgent(request), note: alertNote }).catch((error) => console.error(`Admin login alert not sent: ${describeEmailError(error)}`));
  const profile = adminProfile(admin);
  return response.json({ success: true, token: jwt.sign({ id: admin.id, username: admin.username, role: profile.role }, adminJwtSecret(), { expiresIn: ADMIN_SESSION }), admin: profile });
};

// Admin login, step 1: Gmail address + password. A correct password does not log in yet: it emails a
// 4-digit code to the admin's Gmail and returns a short-lived challenge for step 2 (verifyLoginOtp).
export const login = async (request, response) => {
  const identifier = typeof request.body.username === "string" ? request.body.username.trim().toLowerCase() : "";
  const password = typeof request.body.password === "string" ? request.body.password : "";
  if (!adminJwtSecret()) return response.status(503).json({ success: false, message: WEAK_SECRET_MESSAGE });
  if (!isEmail(identifier)) return response.status(400).json({ success: false, message: "Enter your admin Gmail address." });
  // Lockouts are checked before the password, so a locked account or IP gets no password checks at all.
  const keys = throttleKeys(clientIp(request), identifier);
  const lockedFor = await lockedMinutes(keys);
  if (lockedFor) return response.status(429).json(lockedResponse(lockedFor));
  const admin = await findAdminByGmail(identifier);
  if (!admin || admin.active === false || !(await bcrypt.compare(password, admin.passwordHash))) {
    const nowLocked = await recordFailure(keys);
    console.warn(`Failed admin login for ${identifier} from ${clientIp(request)}${nowLocked ? " (now locked)" : ""}.`);
    return nowLocked ? response.status(429).json(lockedResponse(LOCK_MS / 60000)) : response.status(401).json({ ...INVALID_ADMIN_LOGIN, canSetup: true });
  }
  if (!adminGmail(admin)) return response.status(403).json({ success: false, message: "This admin account has no Gmail address for the verification code. Ask the General Admin to set one." });
  let reused;
  try {
    ({ reused } = await sendCode(admin, "login"));
  } catch (error) {
    return response.status(503).json({ success: false, message: `The verification code could not be emailed: ${describeEmailError(error)}` });
  }
  console.log(`Admin login code ${reused ? "already sent" : "sent"} for ${admin.username}.`);
  return response.json({ success: true, otpRequired: true, challenge: signChallenge(admin._id, "login"), sentTo: maskEmail(adminGmail(admin)), expiresInSeconds: OTP_TTL_MS / 1000, message: reused ? "A code was sent less than a minute ago. Check your Gmail." : "A 4-digit code was sent to your Gmail." });
};

// Admin login, step 2: the 4-digit code. Five wrong codes (or 5 minutes) cancel it; the admin then starts again.
export const verifyLoginOtp = async (request, response) => {
  const checked = await checkCode(request, response, "login");
  return checked ? finishLogin(request, response, checked) : undefined;
};

// First-time login / forgot password, step 1: Gmail only. Emails a 4-digit code if the Gmail is an active admin
// account. The answer is the same either way, so this can't be used to discover which Gmail addresses are admins.
export const requestPasswordSetup = async (request, response) => {
  const gmail = typeof request.body.username === "string" ? request.body.username.trim().toLowerCase() : "";
  if (!adminJwtSecret()) return response.status(503).json({ success: false, message: WEAK_SECRET_MESSAGE });
  if (!isEmail(gmail)) return response.status(400).json({ success: false, message: "Enter your admin Gmail address." });
  const keys = throttleKeys(clientIp(request), gmail);
  const lockedFor = await lockedMinutes(keys);
  if (lockedFor) return response.status(429).json(lockedResponse(lockedFor));
  // Every request counts toward the IP limit, so nobody can use this to flood an inbox or probe many addresses.
  await recordFailure([keys[0]]);
  const admin = await findAdminByGmail(gmail);
  let challengeFor = "000000000000000000000000"; // no account: a challenge that can never match a code
  if (admin && admin.active !== false && adminGmail(admin)) {
    try {
      await sendCode(admin, "setup");
      challengeFor = admin._id;
      console.log(`Admin password setup code sent for ${admin.username} (requested from ${clientIp(request)}).`);
    } catch (error) {
      return response.status(503).json({ success: false, message: `The code could not be emailed: ${describeEmailError(error)}` });
    }
  } else {
    console.warn(`Admin password setup requested for a non-admin Gmail (${gmail}) from ${clientIp(request)}.`);
  }
  return response.json({ success: true, challenge: signChallenge(challengeFor, "setup"), sentTo: maskEmail(gmail), expiresInSeconds: OTP_TTL_MS / 1000, message: "If this Gmail is an admin account, a 4-digit code was sent to it." });
};

// First-time login / forgot password, step 2: the code + a new password. Sets the password and logs in.
export const completePasswordSetup = async (request, response) => {
  const newPassword = typeof request.body.newPassword === "string" ? request.body.newPassword : "";
  const checked = await checkCode(request, response, "setup");
  if (!checked) return undefined;
  const problem = passwordProblem(newPassword, adminGmail(checked.admin));
  // A weak password doesn't use up the code, so the admin can just choose a better one.
  if (problem) return response.status(400).json({ success: false, field: "newPassword", message: problem });
  if (await bcrypt.compare(newPassword, checked.admin.passwordHash)) return response.status(400).json({ success: false, field: "newPassword", message: "Choose a password different from the current one." });
  return finishLogin(request, response, checked, { passwordHash: await bcrypt.hash(newPassword, 12) }, "password was set with an emailed code");
};

export const getMe = (request, response) => response.json({ admin: adminProfile({ _id: request.admin.id, ...request.admin }) });

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

// ---------- Admin Dashboard Summary (purely focused on team and registration management) ----------
export const getDashboard = async (_request, response) => {
  const [stats = {}] = await Registration.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        membersCount: { $sum: { $size: { $ifNull: ["$members", []] } } },
        facultyCount: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$mentor.name", ""] } }, 0] }, 1, 0] } },
        emailsSent: { $sum: { $cond: [{ $eq: ["$registrationEmail.status", "Sent"] }, 1, 0] } },
        emailsFailed: { $sum: { $cond: [{ $eq: ["$registrationEmail.status", "Failed"] }, 1, 0] } },
        pdfSubmitted: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$pdfSubmission.fileId", null] }, null] }, 1, 0] } },
        prototypeSubmitted: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$prototypeSubmission.url", null] }, null] }, 1, 0] } },
        round1Selected: { $sum: { $cond: [{ $eq: ["$roundResults.round1.status", "SELECTED"] }, 1, 0] } },
      },
    },
  ]);

  const totalTeams = stats.total || 0;
  const colleges = await Registration.distinct("college");
  const themes = await Registration.distinct("projectTheme");

  return response.json({
    totalRegistrations: totalTeams,
    totalTeams,
    totalParticipants: (stats.membersCount || 0) + totalTeams,
    totalColleges: colleges.filter(Boolean).length,
    totalThemes: themes.filter(Boolean).length,
    emailsSent: stats.emailsSent || 0,
    emailsFailed: stats.emailsFailed || 0,
    pdfSubmitted: stats.pdfSubmitted || 0,
    prototypeSubmitted: stats.prototypeSubmitted || 0,
    round1Selected: stats.round1Selected || 0,
    facultyCount: stats.facultyCount || 0,
  });
};

// Build common filter for team registrations
const buildTeamFilter = (query) => {
  const filters = [searchFilter(query.search, ["teamName", "teamId", "registrationNumber", "leader.name", "leader.email", "college", "projectTheme"])];
  if (query.college === "sathyabama") filters.push({ college: /^sathyabama institute of science and technology$/i });
  else if (query.college === "other") filters.push({ college: { $not: /^sathyabama institute of science and technology$/i } });
  else if (query.college && query.college !== "all") filters.push({ college: String(query.college) });

  if (query.theme && query.theme !== "all") {
    filters.push({ projectTheme: String(query.theme) });
  }

  if (query.emailStatus && query.emailStatus !== "all") {
    if (query.emailStatus === "sent") filters.push({ "registrationEmail.status": "Sent" });
    else if (query.emailStatus === "sending") filters.push({ "registrationEmail.status": "Sending" });
    else if (query.emailStatus === "failed") filters.push({ "registrationEmail.status": "Failed" });
    else if (query.emailStatus === "not-sent") filters.push({ $or: [{ "registrationEmail.status": "Not Sent" }, { "registrationEmail.status": { $exists: false } }] });
  }

  // Also support status filter from older clients
  if (query.status && query.status !== "all") {
    if (["sent", "sending", "failed", "not-sent"].includes(query.status)) {
      if (query.status === "sent") filters.push({ "registrationEmail.status": "Sent" });
      else if (query.status === "sending") filters.push({ "registrationEmail.status": "Sending" });
      else if (query.status === "failed") filters.push({ "registrationEmail.status": "Failed" });
      else filters.push({ $or: [{ "registrationEmail.status": "Not Sent" }, { "registrationEmail.status": { $exists: false } }] });
    }
  }

  return { $and: filters };
};

// Paginated team/registration list
export const getRegistrations = async (request, response) => {
  const { query } = request;
  const match = buildTeamFilter(query);

  const all = query.all === "1";
  const { page, limit, skip } = all ? { page: 1, limit: 2000, skip: 0 } : pageParams(query);
  const projection = SECRET_FIELDS;

  const [result] = await Registration.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }, { $project: projection }],
        total: [{ $count: "n" }],
      },
    },
  ]);
  const total = result.total[0]?.n || 0;
  return response.json({ items: result.items, total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) });
};

// Team Lists endpoint (repurposed from Payment History)
export const getTeamLists = async (request, response) => {
  const { query } = request;
  const { page, limit, skip } = pageParams(query);
  const match = buildTeamFilter(query);

  try {
    const [[summary = {}], items, total] = await Promise.all([
      Registration.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            sent: { $sum: { $cond: [{ $eq: ["$registrationEmail.status", "Sent"] }, 1, 0] } },
            sending: { $sum: { $cond: [{ $eq: ["$registrationEmail.status", "Sending"] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ["$registrationEmail.status", "Failed"] }, 1, 0] } },
          },
        },
      ]),
      Registration.find(match, SECRET_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Registration.countDocuments(match),
    ]);

    const formattedItems = items.map((team) => ({
      ...team,
      emailStatus: team.registrationEmail?.status || "Not Sent",
      emailSentAt: team.registrationEmail?.sentAt || null,
      emailError: team.registrationEmail?.error || null,
    }));

    return response.json({
      items: formattedItems,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
      summary: {
        total: summary.total || 0,
        sent: summary.sent || 0,
        sending: summary.sending || 0,
        failed: summary.failed || 0,
        notSent: (summary.total || 0) - (summary.sent || 0) - (summary.sending || 0) - (summary.failed || 0),
      },
    });
  } catch (error) {
    console.error("Team lists error:", error);
    return response.status(500).json({ success: false, message: "Failed to fetch team lists.", error: error.message });
  }
};

// Aliased for backwards compatibility with any remaining payments call
export const getPayments = getTeamLists;

// Distinct colleges
export const getColleges = async (_request, response) => {
  const colleges = (await Registration.distinct("college")).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return response.json({ colleges });
};

export const getFaculty = async (_request, response) =>
  response.json(await Registration.find({ "mentor.name": { $ne: "" } }, "mentor college teamName createdAt"));

export const toListItem = (doc) => (doc.toJSON ? doc.toJSON() : doc);
const SATHYABAMA = "sathyabama institute of science and technology";
export const setCollege = (registration, college) => {
  registration.college = college;
  registration.collegeName = college;
  registration.collegeType = college.toLowerCase() === SATHYABAMA ? "sathyabama" : "other";
};
const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

export const updateRegistration = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ success: false, message: "Registration not found." });
  const registration = await Registration.findById(request.params.id);
  if (!registration) return response.status(404).json({ success: false, message: "Registration not found." });

  const { teamName, leader = {}, members } = request.body;
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
    members.forEach((member, index) => {
      if (!cleanText(member?.name)) errors[`member-${index}`] = "Member name is required.";
    });
  }
  const nextCollege = request.body.college === undefined ? undefined : cleanText(request.body.college);
  if (nextCollege !== undefined && !nextCollege) errors.college = "College is required.";
  if (Object.keys(errors).length) return response.status(400).json({ success: false, message: "Please correct the highlighted fields.", errors });

  registration.teamName = nextTeamName;
  registration.leader.name = nextLeader.name;
  registration.leader.email = nextLeader.email;
  registration.leader.phone = nextLeader.phone;
  members.forEach((member, index) => {
    registration.members[index].name = cleanText(member.name);
  });
  if (nextCollege !== undefined) setCollege(registration, nextCollege);
  await registration.save();

  return response.json({ success: true, message: "Team details updated successfully.", registration: toListItem(registration) });
};

// ---------- Google Sheets Import ----------
export const importSpreadsheet = async (request, response) => {
  if (!request.file || !request.file.buffer) {
    return response.status(400).json({ success: false, message: "Please upload a valid .xlsx or .csv spreadsheet file." });
  }

  try {
    const result = await processSpreadsheetImport(request.file.buffer);
    const { importedCount, skippedCount, duplicateCount } = result.summary;
    let message = `Import completed: ${importedCount} new team${importedCount === 1 ? "" : "s"} formed.`;
    if (skippedCount > 0) {
      message += ` ${skippedCount} existing team${skippedCount === 1 ? "" : "s"} already in site were kept untouched.`;
    }
    if (duplicateCount > 0) {
      message += ` ${duplicateCount} duplicate row${duplicateCount === 1 ? "" : "s"} skipped.`;
    }
    return response.json({
      success: true,
      message,
      summary: result.summary,
      invalidRecords: result.invalidRecords,
      detectedColumns: result.detectedColumns,
    });
  } catch (error) {
    console.error("Spreadsheet import failure:", error);
    return response.status(500).json({ success: false, message: error.message || "Failed to parse spreadsheet." });
  }
};

import { getNextSequentialTeamId, isSequentialDexId } from "../services/teamIdService.js";
export { getNextSequentialTeamId, isSequentialDexId };

// ---------- Email Sending for Teams in Team Lists ----------
export const sendTeamEmail = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ success: false, message: "Team not found." });
  const team = await Registration.findById(request.params.id);
  if (!team) return response.status(404).json({ success: false, message: "Team not found." });

  const force = Boolean(request.body?.force);
  if (team.registrationEmail?.status === "Sent" && !force) {
    return response.status(409).json({
      success: false,
      alreadySent: true,
      message: "A confirmation email was already sent to this team. Click 'Resend' to force send.",
      status: "Sent",
    });
  }

  // Assign sequential Team ID (DEX26001, DEX26002, etc.) in order of registration mail send counts
  if (!isSequentialDexId(team.teamId)) {
    const { teamId: nextId, registrationNumber: nextReg } = await getNextSequentialTeamId();
    team.teamId = nextId;
    team.registrationNumber = nextReg;
  }

  const now = new Date();
  team.registrationEmail = {
    status: "Sending",
    attemptAt: now,
    error: null,
  };
  await team.save();

  try {
    const result = await sendTeamConfirmationEmail(team);
    markEmailHealthy();

    team.registrationEmail = {
      status: "Sent",
      sentAt: new Date(),
      messageId: result.messageId,
      error: null,
    };
    await team.save();

    return response.json({
      success: true,
      emailSent: true,
      status: "Sent",
      teamId: team.teamId,
      message: `Confirmation email sent successfully to ${team.leader?.email} with User ID ${team.teamId}.`,
      messageId: result.messageId,
    });
  } catch (error) {
    resetEmailHealth();
    const reason = describeEmailError(error);

    team.registrationEmail = {
      status: "Failed",
      attemptAt: now,
      error: reason,
    };
    await team.save();

    return response.status(500).json({
      success: false,
      emailSent: false,
      status: "Failed",
      message: `Failed to send email: ${reason}`,
      error: reason,
    });
  }
};

export const getTeamEmailPreview = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ success: false, message: "Team not found." });
  const team = await Registration.findById(request.params.id);
  if (!team) return response.status(404).json({ success: false, message: "Team not found." });

  try {
    // If not yet assigned a sequential ID, preview with the next sequence in order
    let previewTeam = team;
    if (!isSequentialDexId(team.teamId)) {
      const { teamId: predictedId, registrationNumber: predictedReg } = await getNextSequentialTeamId();
      previewTeam = {
        ...team.toObject(),
        teamId: predictedId,
        registrationNumber: predictedReg,
      };
    }

    const preview = previewTeamConfirmationEmail(previewTeam);
    return response.json({
      success: true,
      teamId: previewTeam.teamId,
      teamName: team.teamName,
      recipient: preview.to,
      subject: preview.subject,
      html: preview.html,
      text: preview.text,
      status: team.registrationEmail?.status || "Not Sent",
      sentAt: team.registrationEmail?.sentAt || null,
      error: team.registrationEmail?.error || null,
    });
  } catch (error) {
    return response.status(500).json({ success: false, message: error.message });
  }
};

export const getTeamEmailStatus = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ success: false, message: "Team not found." });
  const team = await Registration.findById(request.params.id, "registrationEmail leader teamName").lean();
  if (!team) return response.status(404).json({ success: false, message: "Team not found." });

  return response.json({
    status: team.registrationEmail?.status || "Not Sent",
    sentAt: team.registrationEmail?.sentAt || null,
    error: team.registrationEmail?.error || null,
    recipient: team.leader?.email || "",
  });
};

// Aliases for legacy compatibility
export const confirmPayment = sendTeamEmail;
export const resendPaymentConfirmationEmail = sendTeamEmail;
export const getPaymentEmailStatus = getTeamEmailStatus;

// Admin test email
export const sendAdminTestEmail = async (request, response) => {
  const to = typeof request.body?.to === "string" ? request.body.to.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return response.status(400).json({ success: false, emailSent: false, provider: emailProvider(), error: "Enter a valid recipient email address." });
  try {
    const { messageId } = await sendTestEmail(to);
    markEmailHealthy();
    return response.json({ success: true, emailSent: true, provider: emailProvider(), messageId, message: `Test email sent to ${to}.` });
  } catch (error) {
    resetEmailHealth();
    return response.status(502).json({ success: false, emailSent: false, provider: emailProvider(), error: describeEmailError(error) });
  }
};

export const getEmailHealthStatus = async (_request, response) => response.json(await getEmailHealth());

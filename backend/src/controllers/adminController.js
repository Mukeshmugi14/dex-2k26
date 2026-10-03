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

export const getDashboard = async (_request, response) => {
  const registrations = await Registration.find();
  const successful = registrations.filter(({ payment }) => payment.status === "Successful" && payment.confirmedAt);
  return response.json({
    totalRegistrations: registrations.length,
    totalTeams: registrations.length,
    totalParticipants: registrations.reduce((total, item) => total + item.members.length, 0),
    totalFacultyRegistrations: registrations.filter((item) => item.mentor?.name).length,
    totalAmount: successful.reduce((total, item) => total + item.payment.amount, 0),
    successfulPayments: successful.length,
    pendingPayments: registrations.filter(({ payment }) => payment.status !== "Successful" && payment.status !== "Failed").length,
    failedPayments: registrations.filter(({ payment }) => payment.status === "Failed").length,
  });
};

export const getRegistrations = async (request, response) => {
  const search = request.query.search ? new RegExp(request.query.search, "i") : null;
  const filter = search ? { $or: [{ teamName: search }, { teamId: search }, { registrationNumber: search }, { "leader.name": search }, { "leader.email": search }, { college: search }, { "payment.transactionId": search }] } : {};
  return response.json(await Registration.find(filter).sort({ createdAt: -1 }));
};

export const getPayments = async (_request, response) => response.json(await Registration.find({}, "teamId teamName college leader payment createdAt").sort({ createdAt: -1 }));
export const getFaculty = async (_request, response) => response.json(await Registration.find({ "mentor.name": { $ne: "" } }, "mentor college teamName createdAt"));

const MAX_LOGO_LENGTH = 1_500_000;
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

  return response.json({ success: true, message: "Team details updated successfully.", registration });
};

const updateConfirmationEmailStatus = async (registration) => {
  try {
    console.log(`Starting payment confirmation email for ${registration._id} to ${registration.leader?.email || "missing recipient"}.`);
    // Every confirmation email (including resends) carries the team's one permanent PDF submission link.
    const submissionToken = await issueSubmissionToken(registration._id);
    const sent = await sendPaymentConfirmationEmail(registration, { submissionUrl: buildSubmissionUrl(submissionToken) });
    registration.payment.confirmationEmailStatus = sent ? "Sent" : "Failed";
    if (sent) registration.payment.confirmationEmailSentAt = new Date();
    await registration.save();
    console.log(`Payment confirmation email ${sent ? "sent" : "not accepted"} for ${registration._id}.`);
    return sent;
  } catch (error) {
    console.error("Confirmation Email Error:", error);
    console.error("Error details:", {
      registrationId: registration._id,
      recipient: registration.leader?.email || null,
      code: error.code || null,
      responseCode: error.responseCode || null,
      message: error.message,
    });
    registration.payment.confirmationEmailStatus = "Failed";
    await registration.save();
    return false;
  }
};

export const confirmPayment = async (request, response) => {
  const registration = await Registration.findById(request.params.id);
  if (!registration) return response.status(404).json({ message: "Registration not found." });
  if (registration.payment.confirmedAt) return response.json({ success: true, alreadyConfirmed: true, registration });
  if (!registration.payment.transactionId) return response.status(400).json({ message: "A transaction ID is required before confirming payment." });

  registration.payment.status = "Successful";
  registration.payment.confirmedAt = new Date();
  registration.payment.confirmedBy = request.admin.username;
  await registration.save();

  console.log(`Payment confirmed successfully for ${registration._id}.`);

  const emailSent = await updateConfirmationEmailStatus(registration);
  return response.json({
    success: true,
    paymentConfirmed: true,
    emailSent,
    message: emailSent ? "Payment confirmed and confirmation email sent." : "Payment confirmed, but confirmation email failed.",
    registration,
  });
};

export const resendPaymentConfirmationEmail = async (request, response) => {
  const registration = await Registration.findById(request.params.id);
  if (!registration) return response.status(404).json({ message: "Registration not found." });
  if (!registration.payment.confirmedAt) return response.status(400).json({ message: "Confirm the payment before sending its confirmation email." });

  const emailSent = await updateConfirmationEmailStatus(registration);
  return response.json({
    success: emailSent,
    paymentConfirmed: true,
    emailSent,
    message: emailSent ? "Confirmation email sent." : "Confirmation email could not be sent.",
    registration,
  });
};

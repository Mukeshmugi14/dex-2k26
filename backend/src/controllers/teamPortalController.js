import crypto from "crypto";
import mongoose from "mongoose";
import Registration from "../models/Registration.js";
import { signTeamToken } from "../middleware/teamAuthMiddleware.js";
import { currentRound, readRounds, ROUND_INFO } from "../services/roundService.js";
import { deriveSubmissionStatus, getTeamPortalPassword, openPdfStream } from "../services/submissionService.js";

const INVALID_LOGIN = { success: false, message: "Invalid email or password." };
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Constant-time comparison against the general Team Head password (configurable on the server).
const passwordMatches = (password) => {
  const expected = crypto.createHash("sha256").update(getTeamPortalPassword()).digest();
  const given = crypto.createHash("sha256").update(typeof password === "string" ? password : "").digest();
  return crypto.timingSafeEqual(expected, given);
};

// Only teams whose payment has been confirmed can sign in; the most recently confirmed team wins if an email is reused.
const findTeamByHeadEmail = (email) => Registration.findOne({
  "leader.email": { $regex: `^\\s*${escapeRegex(email)}\\s*$`, $options: "i" },
  "payment.confirmedAt": { $exists: true, $ne: null },
}).sort({ "payment.confirmedAt": -1 });

export const teamLogin = async (request, response) => {
  const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const passwordOk = passwordMatches(request.body.password);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return response.status(401).json(INVALID_LOGIN);
  const team = await findTeamByHeadEmail(email);
  if (!team || !passwordOk) return response.status(401).json(INVALID_LOGIN);
  return response.json({ success: true, token: signTeamToken(team._id), teamHead: team.leader?.name || "" });
};

const loadOwnTeam = async (request) => {
  if (!mongoose.isValidObjectId(request.teamRegistrationId)) return null;
  const team = await Registration.findById(request.teamRegistrationId);
  return team?.payment?.confirmedAt ? team : null;
};

const cleanMembers = (members = []) => {
  const seen = new Set();
  return members
    .map((member) => (typeof member?.name === "string" ? member.name.trim() : ""))
    .filter((name) => name && !["undefined", "null"].includes(name.toLowerCase()))
    .filter((name) => { const key = name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
};

// Everything the Team Head may see about their own team — nothing else.
export const getOwnTeam = async (request, response) => {
  const team = await loadOwnTeam(request);
  if (!team) return response.status(401).json({ success: false, message: "Please log in to the Team Head Portal." });
  const rounds = readRounds(team);
  const current = currentRound(rounds);
  const evaluation = team.evaluation || {};
  const released = Boolean(team.rounds?.scoreReleased) && Number.isFinite(evaluation.totalScore);
  return response.json({
    success: true,
    team: { teamName: team.teamName, teamHead: team.leader?.name || "", teamHeadEmail: team.leader?.email || "", college: team.college || team.collegeName || "", members: cleanMembers(team.members) },
    submission: team.pdfSubmission?.fileId
      ? { submitted: true, fileName: team.pdfSubmission.fileName, submittedAt: team.pdfSubmission.submittedAt, status: deriveSubmissionStatus(team) }
      : { submitted: false },
    rounds: Object.entries(rounds).map(([key, status]) => ({ key, number: ROUND_INFO[key].number, title: ROUND_INFO[key].title, status })),
    current: { round: ROUND_INFO[current.key].number, status: current.status },
    evaluation: released ? { totalScore: evaluation.totalScore, result: evaluation.result } : null,
    updatedAt: team.rounds?.updatedAt || null,
  });
};

export const streamOwnPdf = async (request, response) => {
  const team = await loadOwnTeam(request);
  if (!team) return response.status(401).json({ success: false, message: "Please log in to the Team Head Portal." });
  if (!team.pdfSubmission?.fileId) return response.status(404).json({ success: false, message: "Your team has not submitted a PDF yet." });
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `inline; filename="${(team.pdfSubmission.fileName || "submission.pdf").replace(/"/g, "")}"`);
  response.setHeader("Cache-Control", "private, no-store");
  openPdfStream(team.pdfSubmission.fileId)
    .on("error", () => { if (!response.headersSent) response.status(404).json({ success: false, message: "The PDF file could not be found." }); else response.end(); })
    .pipe(response);
};

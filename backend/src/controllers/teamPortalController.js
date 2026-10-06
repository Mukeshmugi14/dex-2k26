import crypto from "crypto";
import mongoose from "mongoose";
import Registration from "../models/Registration.js";
import { signTeamToken } from "../middleware/teamAuthMiddleware.js";
import { currentRound, readRounds, ROUND_INFO } from "../services/roundService.js";
import { deriveSubmissionStatus, getTeamPortalPassword, openPdfStream } from "../services/submissionService.js";
import { PROTOTYPE_CATEGORIES, prototypeView, validatePrototypeUrl } from "../services/prototypeService.js";

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
  const team = await Registration.findById(request.teamRegistrationId).select("-teamLogo");
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
    team: { teamName: team.teamName, teamHead: team.leader?.name || "", teamHeadEmail: team.leader?.email || "", college: team.college || team.collegeName || "", projectTheme: team.projectTheme || "Not selected", members: cleanMembers(team.members) },
    submission: team.pdfSubmission?.fileId
      ? { submitted: true, fileName: team.pdfSubmission.fileName, fileSize: team.pdfSubmission.fileSize, submittedAt: team.pdfSubmission.submittedAt, status: deriveSubmissionStatus(team) }
      : { submitted: false },
    prototype: prototypeView(team, rounds),
    rounds: Object.entries(rounds).map(([key, status]) => ({ key, number: ROUND_INFO[key].number, title: ROUND_INFO[key].title, status })),
    current: { round: ROUND_INFO[current.key].number, status: current.status },
    evaluation: released ? { totalScore: evaluation.totalScore, result: evaluation.result } : null,
    updatedAt: team.rounds?.updatedAt || null,
  });
};

// Round 2: the logged-in team saves its own prototype link once (the token decides which team).
export const submitPrototype = async (request, response) => {
  const team = await loadOwnTeam(request);
  if (!team) return response.status(401).json({ success: false, message: "Please log in to the Team Head Portal." });
  const view = prototypeView(team, readRounds(team));
  if (view.submitted) return response.status(409).json({ success: false, alreadySubmitted: true, message: "Your team has already submitted its Round 2 prototype." });
  if (!view.eligible) return response.status(403).json({ success: false, message: "Round 2 submission is not available for your team." });
  if (!view.open) return response.status(403).json({ success: false, message: "Round 2 prototype submission has closed." });

  const category = typeof request.body.category === "string" ? request.body.category.trim().toUpperCase() : "";
  if (!PROTOTYPE_CATEGORIES.includes(category)) return response.status(400).json({ success: false, message: "Please choose Software or Hardware." });
  const { url, error } = validatePrototypeUrl(category, request.body.url);
  if (error) return response.status(400).json({ success: false, message: error });

  // Atomic: only the first submission is recorded; a parallel duplicate is rejected.
  const result = await Registration.updateOne(
    { _id: team._id, $or: [{ "prototypeSubmission.url": { $exists: false } }, { "prototypeSubmission.url": null }] },
    { $set: { "prototypeSubmission.category": category, "prototypeSubmission.url": url, "prototypeSubmission.submittedAt": new Date() } },
  );
  if (!result.modifiedCount) return response.status(409).json({ success: false, alreadySubmitted: true, message: "Your team has already submitted its Round 2 prototype." });

  const updated = await Registration.findById(team._id).select("-teamLogo");
  console.log(`Round 2 prototype submitted for ${team.teamId} (${category}).`);
  return response.status(201).json({ success: true, message: "Round 2 prototype submitted successfully.", prototype: prototypeView(updated, readRounds(updated)) });
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

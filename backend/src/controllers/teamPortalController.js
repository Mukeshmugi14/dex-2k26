import crypto from "crypto";
import mongoose from "mongoose";
import Registration from "../models/Registration.js";
import { signTeamToken } from "../middleware/teamAuthMiddleware.js";
import { currentRound, readRounds, ROUND_INFO } from "../services/roundService.js";
import { deriveSubmissionStatus, getTeamPortalPassword, openPdfStream } from "../services/submissionService.js";
import { PROTOTYPE_CATEGORIES, prototypeView, validatePrototypeUrl } from "../services/prototypeService.js";

import { findTeamByIdentifier, passwordMatches } from "../services/teamIdService.js";

const INVALID_LOGIN = { success: false, message: "Invalid User ID (Team ID) or password." };

export const teamLogin = async (request, response) => {
  const identifier = typeof request.body.userId === "string" && request.body.userId.trim()
    ? request.body.userId.trim()
    : typeof request.body.teamId === "string" && request.body.teamId.trim()
    ? request.body.teamId.trim()
    : typeof request.body.teamName === "string" && request.body.teamName.trim()
    ? request.body.teamName.trim()
    : typeof request.body.email === "string" && request.body.email.trim()
    ? request.body.email.trim()
    : "";

  const password = typeof request.body.password === "string" ? request.body.password : "";
  if (!identifier || !password) return response.status(401).json(INVALID_LOGIN);

  const passwordOk = passwordMatches(password);
  if (!passwordOk) return response.status(401).json(INVALID_LOGIN);

  const team = await findTeamByIdentifier(identifier);
  if (!team) return response.status(401).json({ success: false, message: "Team not found. Check your Team ID." });

  return response.json({
    success: true,
    token: signTeamToken(team._id),
    teamId: team.teamId,
    teamHead: team.leader?.name || "",
    teamName: team.teamName,
  });
};

const loadOwnTeam = async (request) => {
  if (!mongoose.isValidObjectId(request.teamRegistrationId)) return null;
  return Registration.findById(request.teamRegistrationId);
};

const cleanMembers = (members = []) => {
  const seen = new Set();
  const cleaned = [];
  for (const member of members) {
    const name = typeof member === "string" ? member.trim() : typeof member?.name === "string" ? member.name.trim() : "";
    if (!name || ["undefined", "null"].includes(name.toLowerCase())) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    cleaned.push({
      name,
      college: member?.college || "",
      year: member?.year || "",
      department: member?.department || "",
      phone: member?.phone || "",
      email: member?.email || "",
      studentId: member?.studentId || "",
    });
  }
  return cleaned;
};

// Everything the Team Head may see about their own team — nothing else.
export const getOwnTeam = async (request, response) => {
  const team = await loadOwnTeam(request);
  if (!team) return response.status(401).json({ success: false, message: "Please log in to the Team Head Portal." });
  const rounds = readRounds(team);
  const current = currentRound(rounds);
  const evaluation = team.evaluation || {};
  const released = Boolean(team.rounds?.scoreReleased) && Number.isFinite(evaluation.totalScore);
  const members = cleanMembers(team.members);
  const teamSize = team.teamSize || (members.length + 1);

  return response.json({
    success: true,
    team: {
      teamName: team.teamName,
      teamHead: team.leader?.name || "",
      teamHeadEmail: team.leader?.email || "",
      teamHeadPhone: team.leader?.phone || "",
      college: team.college || team.collegeName || "",
      department: team.department || "",
      year: team.year || "",
      projectTheme: team.projectTheme || "Not selected",
      teamSize,
      members,
    },
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

  const updated = await Registration.findById(team._id);
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

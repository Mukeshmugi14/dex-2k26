import crypto from "crypto";
import mongoose from "mongoose";
import Registration, { PROJECT_THEMES } from "../models/Registration.js";
import { signTeamToken } from "../middleware/teamAuthMiddleware.js";
import { currentRound, readRounds, ROUND_INFO } from "../services/roundService.js";
import { deriveSubmissionStatus, getRound1Deadline, getTeamPortalPassword, openPdfStream, round1Open } from "../services/submissionService.js";
import { getRound2EditDeadline, PROTOTYPE_CATEGORIES, prototypeView, ROUND2_EDIT_CLOSED_MESSAGE, validatePrototypeUrl } from "../services/prototypeService.js";

import { findTeamByLeaderCredentials } from "../services/teamIdService.js";
import { getTeamDetailsEditDeadline, MAX_TEAM_MEMBERS, TEAM_DETAILS_EDIT_CLOSED_MESSAGE, teamDetailsEditable, validateTeamDetails } from "../services/teamDetailsService.js";
import { setCollege } from "./adminController.js";
import { createCollegeLookup, resolutionFor } from "../services/collegeRegistry.js";
import { memberCollegeNames, teamCollegeMix } from "../services/teamColleges.js";

const INVALID_LOGIN = { success: false, message: "Invalid Team Head email or Team ID. Please check and try again." };

// Team Head email is the login; that team's existing Team ID is the password.
export const teamLogin = async (request, response) => {
  const email = typeof request.body.email === "string" ? request.body.email.trim() : "";
  const password = typeof request.body.password === "string" ? request.body.password.trim() : "";
  if (!email || !password) {
    return response.status(400).json({ success: false, message: "Please enter your Team Head email and Team ID." });
  }

  const team = await findTeamByLeaderCredentials(email, password);
  if (!team) return response.status(401).json(INVALID_LOGIN);

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
  // Cross-college teams see which colleges their people come from (names as the team wrote them when not in the registry).
  const lookup = await createCollegeLookup();
  await lookup.prepare(memberCollegeNames([team]));
  const mix = teamCollegeMix(team, lookup);
  const colleges = mix.crossCollege ? mix.colleges.map((c) => ({ name: c.collegeId ? c.name : c.name.replace(/^Needs review: /, ""), people: c.people })) : [];

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
      crossCollege: mix.crossCollege,
      colleges,
    },
    detailsEdit: { editable: teamDetailsEditable(), deadline: getTeamDetailsEditDeadline(), maxMembers: MAX_TEAM_MEMBERS, themes: PROJECT_THEMES },
    submission: {
      ...(team.pdfSubmission?.fileId
        ? { submitted: true, fileName: team.pdfSubmission.fileName, fileSize: team.pdfSubmission.fileSize, submittedAt: team.pdfSubmission.submittedAt, status: deriveSubmissionStatus(team) }
        : { submitted: false }),
      deadline: getRound1Deadline(),
      open: round1Open(),
    },
    prototype: prototypeView(team, rounds),
    rounds: Object.entries(rounds).map(([key, status]) => ({ key, number: ROUND_INFO[key].number, title: ROUND_INFO[key].title, status })),
    current: { round: ROUND_INFO[current.key].number, status: current.status },
    evaluation: released ? { totalScore: evaluation.totalScore, result: evaluation.result } : null,
    updatedAt: team.rounds?.updatedAt || null,
  });
};

// The logged-in team updates its own team and member details until the edit deadline (server time).
// The Team ID stays as registered; a new Team Head email becomes the login. Members may be added (up to the limit), not removed.
export const updateOwnTeamDetails = async (request, response) => {
  const team = await loadOwnTeam(request);
  if (!team) return response.status(401).json({ success: false, message: "Please log in to the Team Head Portal." });
  if (!teamDetailsEditable()) return response.status(403).json({ success: false, editClosed: true, message: TEAM_DETAILS_EDIT_CLOSED_MESSAGE });

  const shownCount = cleanMembers(team.members).length;
  const { errors, value } = validateTeamDetails(request.body, shownCount);
  if (errors) return response.status(400).json({ success: false, message: errors.members || "Please correct the highlighted fields.", errors });

  // The Team Head email is the login, so it must not belong to another team's Team Head.
  const emailChanged = value.leader.email !== String(team.leader?.email || "").trim().toLowerCase();
  if (emailChanged) {
    const escaped = value.leader.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const taken = await Registration.exists({ _id: { $ne: team._id }, "leader.email": { $regex: `^\\s*${escaped}\\s*$`, $options: "i" } });
    if (taken) return response.status(400).json({ success: false, message: "Please correct the highlighted fields.", errors: { teamHeadEmail: "This email is already the Team Head email of another team." } });
  }

  const college = {};
  setCollege(college, value.team.college);
  // Resolve the (possibly changed) college to the registry; an admin-confirmed mapping is kept if unchanged.
  Object.assign(college, (await resolutionFor(value.team.college, team)) || {});
  // Atomic: only applies to the record this request read, so a parallel admin edit is never silently overwritten.
  const result = await Registration.updateOne(
    { _id: team._id, updatedAt: team.updatedAt },
    { $set: {
      teamName: value.team.teamName,
      ...college,
      department: value.team.department,
      year: value.team.year,
      projectTheme: value.team.projectTheme,
      "leader.name": value.leader.name,
      "leader.email": value.leader.email,
      "leader.phone": value.leader.phone,
      members: value.members,
    },
    // When members are added, a stored team size would be stale; the portal and admin then derive it from the member list.
    ...(value.members.length !== shownCount ? { $unset: { teamSize: "" } } : {}) },
  );
  if (!result.matchedCount) return response.status(409).json({ success: false, message: "Your team details changed. Please refresh and try again." });

  console.log(`Team details updated by Team Head for ${team.teamId}${value.members.length > shownCount ? ` (+${value.members.length - shownCount} member${value.members.length - shownCount === 1 ? "" : "s"})` : ""}.`);
  if (emailChanged) console.log(`Team Head email changed for ${team.teamId}.`);
  return response.json({ success: true, emailChanged, message: emailChanged ? "Team details updated. Use your new Team Head email to log in from now on." : "Team details updated successfully." });
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

// Round 2 edit/delete: only the logged-in team's own submission, and only until the edit deadline (server time).
const loadEditablePrototype = async (request, response) => {
  const team = await loadOwnTeam(request);
  if (!team) { response.status(401).json({ success: false, message: "Please log in to the Team Head Portal." }); return null; }
  const view = prototypeView(team, readRounds(team));
  if (!view.submitted) { response.status(404).json({ success: false, message: "Your team has not submitted a Round 2 prototype yet." }); return null; }
  if (!view.eligible) { response.status(403).json({ success: false, message: "Round 2 submission is not available for your team." }); return null; }
  if (Date.now() > getRound2EditDeadline().getTime()) { response.status(403).json({ success: false, editClosed: true, message: ROUND2_EDIT_CLOSED_MESSAGE }); return null; }
  return team;
};

export const updatePrototype = async (request, response) => {
  const team = await loadEditablePrototype(request, response);
  if (!team) return;

  const category = typeof request.body.category === "string" ? request.body.category.trim().toUpperCase() : "";
  if (!PROTOTYPE_CATEGORIES.includes(category)) return response.status(400).json({ success: false, message: "Please choose Software or Hardware." });
  const { url, error } = validatePrototypeUrl(category, request.body.url);
  if (error) return response.status(400).json({ success: false, message: error });

  // Atomic: only updates the submission this request saw, so a parallel delete is never silently undone.
  const result = await Registration.updateOne(
    { _id: team._id, "prototypeSubmission.url": team.prototypeSubmission.url },
    { $set: { "prototypeSubmission.category": category, "prototypeSubmission.url": url, "prototypeSubmission.submittedAt": new Date() } },
  );
  if (!result.matchedCount) return response.status(409).json({ success: false, message: "Your Round 2 submission changed. Please refresh and try again." });

  const updated = await Registration.findById(team._id);
  console.log(`Round 2 prototype updated for ${team.teamId} (${category}).`);
  return response.json({ success: true, message: "Round 2 prototype updated successfully.", prototype: prototypeView(updated, readRounds(updated)) });
};

export const deletePrototype = async (request, response) => {
  const team = await loadEditablePrototype(request, response);
  if (!team) return;

  const result = await Registration.updateOne(
    { _id: team._id, "prototypeSubmission.url": team.prototypeSubmission.url },
    { $unset: { "prototypeSubmission.category": "", "prototypeSubmission.url": "", "prototypeSubmission.submittedAt": "" } },
  );
  if (!result.modifiedCount) return response.status(409).json({ success: false, message: "Your Round 2 submission changed. Please refresh and try again." });

  const updated = await Registration.findById(team._id);
  console.log(`Round 2 prototype deleted for ${team.teamId}.`);
  return response.json({ success: true, message: "Round 2 prototype submission deleted.", prototype: prototypeView(updated, readRounds(updated)) });
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

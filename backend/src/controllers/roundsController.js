import mongoose from "mongoose";
import Registration from "../models/Registration.js";
import { sendRoundUpdateEmail } from "../services/emailService.js";
import { ALLOWED_ROUND_STATUSES, currentRound, normalizeRounds, readRounds, ROUND_INFO, ROUND_KEYS, roundSnapshot } from "../services/roundService.js";

const LIST_FIELDS = "teamId teamName leader college collegeName payment.confirmedAt evaluation.totalScore evaluation.result rounds roundEmail";
const SENDING_TIMEOUT_MS = 2 * 60 * 1000;

const toView = (team) => {
  const rounds = readRounds(team);
  const current = currentRound(rounds);
  return {
    _id: team._id, teamId: team.teamId, teamName: team.teamName, leader: team.leader, college: team.college || team.collegeName,
    evaluation: { totalScore: team.evaluation?.totalScore ?? null, result: team.evaluation?.result || "Pending" },
    rounds, scoreReleased: Boolean(team.rounds?.scoreReleased), updatedAt: team.rounds?.updatedAt || null, updatedBy: team.rounds?.updatedBy || null,
    current: { round: ROUND_INFO[current.key].number, status: current.status },
    email: { status: team.roundEmail?.status || "Not Sent", sentAt: team.roundEmail?.sentAt || null, upToDate: team.roundEmail?.sentSnapshot === roundSnapshot(rounds) },
  };
};

// Teams that completed payment (the ones who can use the Team Head Portal).
export const listRounds = async (_request, response) => {
  const teams = await Registration.find({ "payment.confirmedAt": { $exists: true, $ne: null } }, LIST_FIELDS).sort({ "payment.confirmedAt": -1 });
  return response.json({ teams: teams.map(toView), allowed: ALLOWED_ROUND_STATUSES });
};

// Emails the current round status once per distinct status combination; an atomic claim prevents parallel duplicates.
export const sendRoundEmailOnce = async (teamId) => {
  const team = await Registration.findById(teamId);
  const rounds = readRounds(team);
  const snapshot = roundSnapshot(rounds);
  if (team.roundEmail?.sentSnapshot === snapshot) return { attempted: false, sent: false, upToDate: true };

  const claimed = await Registration.findOneAndUpdate(
    { _id: teamId, $or: [{ "roundEmail.status": { $ne: "Sending" } }, { "roundEmail.attemptAt": { $lt: new Date(Date.now() - SENDING_TIMEOUT_MS) } }] },
    { $set: { "roundEmail.status": "Sending", "roundEmail.attemptAt": new Date() } },
    { new: true },
  );
  if (!claimed) return { attempted: false, sent: false, inProgress: true };

  let sent = false;
  try {
    sent = await sendRoundUpdateEmail(claimed, rounds);
  } catch (error) {
    console.error("Round Update Email Error:", error);
  }
  await Registration.updateOne({ _id: teamId }, sent
    ? { $set: { "roundEmail.status": "Sent", "roundEmail.sentSnapshot": snapshot, "roundEmail.sentAt": new Date() } }
    : { $set: { "roundEmail.status": "Failed" } });
  return { attempted: true, sent };
};

export const updateRounds = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ success: false, message: "Team not found." });
  const team = await Registration.findById(request.params.id);
  if (!team?.payment?.confirmedAt) return response.status(404).json({ success: false, message: "Team not found." });

  const errors = {};
  const requested = {};
  for (const key of ROUND_KEYS) {
    const value = request.body.rounds?.[key];
    if (!ALLOWED_ROUND_STATUSES[key].includes(value)) errors[key] = "Choose a valid status.";
    requested[key] = value;
  }
  if (Object.keys(errors).length) return response.status(400).json({ success: false, message: "Please choose a valid status for each round.", errors });

  const before = roundSnapshot(readRounds(team));
  const rounds = normalizeRounds(requested);
  const changed = roundSnapshot(rounds) !== before;
  for (const key of ROUND_KEYS) team.rounds[key] = rounds[key];
  if (typeof request.body.scoreReleased === "boolean") team.rounds.scoreReleased = request.body.scoreReleased;
  team.rounds.updatedAt = new Date();
  team.rounds.updatedBy = request.admin?.username || "admin";
  await team.save();

  const email = changed ? await sendRoundEmailOnce(team._id) : { attempted: false, sent: false };
  const updated = await Registration.findById(team._id);
  const emailMessage = !changed ? " Round status unchanged — no email sent." : email.sent ? ` Round update email sent to ${updated.leader?.email}.` : email.attempted ? " Status saved, but the email could not be sent." : "";
  return response.json({ success: true, message: `Round status updated.${emailMessage}`, email, team: toView(updated) });
};

export const resendRoundEmail = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ success: false, message: "Team not found." });
  const team = await Registration.findById(request.params.id);
  if (!team?.payment?.confirmedAt) return response.status(404).json({ success: false, message: "Team not found." });
  const email = await sendRoundEmailOnce(team._id);
  const updated = await Registration.findById(team._id);
  if (email.upToDate) return response.json({ success: true, message: "The team already has an email for its current round status.", team: toView(updated) });
  if (email.inProgress) return response.status(409).json({ success: false, message: "The email is already being sent. Please wait a moment.", team: toView(updated) });
  return response.status(email.sent ? 200 : 502).json({ success: email.sent, message: email.sent ? `Round update email sent to ${updated.leader?.email}.` : "Email could not be sent. Please try again.", team: toView(updated) });
};

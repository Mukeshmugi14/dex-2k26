import mongoose from "mongoose";
import Registration from "../models/Registration.js";
import { sendRoundResultEmail } from "../services/emailService.js";
import { normalizeRounds, readRounds, roundSnapshot } from "../services/roundService.js";

const ROUNDS = [1, 2, 3];
const SENDING_TIMEOUT_MS = 2 * 60 * 1000;
const LIST_FIELDS = "teamId teamName leader college collegeName projectTheme payment.confirmedAt evaluation.totalScore roundResults rounds";
const DECIDED = ["SELECTED", "REJECTED"];

const readResults = (team) => Object.fromEntries(ROUNDS.map((n) => {
  const r = team.roundResults?.[`round${n}`] || {};
  return [n, { status: r.status || "PENDING", decidedAt: r.decidedAt || null, emailStatus: r.emailStatus || "Not Sent", emailSent: Boolean(r.emailSent), emailedStatus: r.emailedStatus || null, emailSentAt: r.emailSentAt || null }];
}));

// Where a team stands: the round it was rejected in, otherwise the first undecided round (or "finished" after Round 3).
const selectionState = (results) => {
  const rejectedRound = ROUNDS.find((n) => results[n].status === "REJECTED") || null;
  const pendingRound = ROUNDS.find((n) => results[n].status === "PENDING") || null;
  const currentRound = rejectedRound || pendingRound || ROUNDS.length;
  const overall = rejectedRound ? "REJECTED" : pendingRound ? "PENDING" : "SELECTED";
  return { rejectedRound, currentRound, overall };
};

// A round can be decided only if every earlier round is SELECTED and no later round has been decided yet.
const canDecide = (results, round) => ROUNDS.filter((n) => n < round).every((n) => results[n].status === "SELECTED")
  && ROUNDS.filter((n) => n > round).every((n) => results[n].status === "PENDING");

const toView = (team) => {
  const results = readResults(team);
  const state = selectionState(results);
  return {
    _id: team._id, teamId: team.teamId, teamName: team.teamName, leader: team.leader, college: team.college || team.collegeName,
    score: Number.isFinite(team.evaluation?.totalScore) ? team.evaluation.totalScore : null,
    results: Object.fromEntries(ROUNDS.map((n) => [n, { ...results[n], emailUpToDate: DECIDED.includes(results[n].status) && results[n].emailedStatus === results[n].status }])),
    currentRound: state.currentRound,
    overall: state.overall,
    decidableRounds: ROUNDS.filter((n) => canDecide(results, n)),
  };
};

const summarize = (views) => ({
  totalTeams: views.length,
  round1Selected: views.filter((v) => v.results[1].status === "SELECTED").length,
  round2Selected: views.filter((v) => v.results[2].status === "SELECTED").length,
  round3Selected: views.filter((v) => v.results[3].status === "SELECTED").length,
  notSelected: views.filter((v) => v.overall === "REJECTED").length,
  pending: views.filter((v) => v.overall === "PENDING").length,
});

// All registered/imported teams (the teams that take part in the rounds).
export const listRoundSelection = async (_request, response) => {
  const teams = await Registration.find({}, LIST_FIELDS).sort({ teamName: 1 }).lean();
  const views = teams.map(toView);
  return response.json({ teams: views, summary: summarize(views) });
};

// Mirror a decision into the round progress shown in the Team Head Portal.
const syncRoundProgress = (team, round, decision, adminName) => {
  const rounds = readRounds(team);
  const key = (n) => `round${n}`;
  ROUNDS.filter((n) => n < round).forEach((n) => { if (!["SELECTED", "COMPLETED"].includes(rounds[key(n)])) rounds[key(n)] = "SELECTED"; });
  if (decision === "SELECTED") {
    rounds[key(round)] = "SELECTED";
    const next = round + 1;
    if (next <= ROUNDS.length && ["UPCOMING", "PENDING", "NOT_SELECTED"].includes(rounds[key(next)])) rounds[key(next)] = "LIVE";
    ROUNDS.filter((n) => n > next).forEach((n) => { if (rounds[key(n)] === "NOT_SELECTED") rounds[key(n)] = "UPCOMING"; });
  } else {
    rounds[key(round)] = "NOT_SELECTED";
  }
  const normalized = normalizeRounds(rounds);
  ROUNDS.forEach((n) => { team.rounds[key(n)] = normalized[key(n)]; });
  team.rounds.updatedAt = new Date();
  team.rounds.updatedBy = adminName;
};

// Sends the result email for one round at most once per decision; an atomic claim stops parallel duplicates.
const sendResultEmailOnce = async (teamId, round) => {
  const path = `roundResults.round${round}`;
  const claimed = await Registration.findOneAndUpdate(
    {
      _id: teamId,
      [`${path}.status`]: { $in: DECIDED },
      $expr: { $ne: [`$${path}.emailedStatus`, `$${path}.status`] },
      $or: [{ [`${path}.emailStatus`]: { $ne: "Sending" } }, { [`${path}.emailAttemptAt`]: { $lt: new Date(Date.now() - SENDING_TIMEOUT_MS) } }],
    },
    { $set: { [`${path}.emailStatus`]: "Sending", [`${path}.emailAttemptAt`]: new Date() } },
    { new: true },
  );
  if (!claimed) return { attempted: false, sent: false };

  const decision = claimed.roundResults[`round${round}`].status;
  let sent = false;
  try {
    sent = await sendRoundResultEmail(claimed, round, decision);
  } catch (error) {
    console.error(`Round ${round} Result Email Error:`, error);
  }
  await Registration.updateOne({ _id: teamId }, sent
    ? { $set: { [`${path}.emailStatus`]: "Sent", [`${path}.emailSent`]: true, [`${path}.emailedStatus`]: decision, [`${path}.emailSentAt`]: new Date(), "roundEmail.sentSnapshot": roundSnapshot(readRounds(claimed)), "roundEmail.status": "Sent", "roundEmail.sentAt": new Date() } }
    : { $set: { [`${path}.emailStatus`]: "Failed" } });
  return { attempted: true, sent };
};

const loadTeam = async (id) => (mongoose.isValidObjectId(id) ? Registration.findById(id) : null);

export const decideRound = async (request, response) => {
  const team = await loadTeam(request.params.id);
  if (!team) return response.status(404).json({ success: false, message: "Team not found." });
  const round = Number(request.body.round);
  const decision = request.body.decision;
  if (!ROUNDS.includes(round)) return response.status(400).json({ success: false, message: "Choose Round 1, 2 or 3." });
  if (!DECIDED.includes(decision)) return response.status(400).json({ success: false, message: "Choose Selected or Rejected." });

  const results = readResults(team);
  if (!canDecide(results, round)) {
    const blocker = ROUNDS.find((n) => n < round && results[n].status !== "SELECTED");
    return response.status(409).json({ success: false, message: blocker ? `Round ${blocker} must be Selected before deciding Round ${round}.` : `A later round has already been decided for this team, so Round ${round} can no longer be changed.` });
  }

  const changed = results[round].status !== decision;
  if (changed) {
    const result = team.roundResults[`round${round}`];
    result.status = decision;
    result.decidedAt = new Date();
    result.decidedBy = request.admin?.username || "admin";
    syncRoundProgress(team, round, decision, result.decidedBy);
    await team.save();
  }

  const email = await sendResultEmailOnce(team._id, round);
  const updated = await Registration.findById(team._id);
  const verb = decision === "SELECTED" ? "selected" : "rejected";
  const base = changed ? `Team ${verb} successfully.` : `Team was already ${verb} for Round ${round}.`;
  const emailMessage = email.sent ? ` Result email sent to ${updated.leader?.email}.` : email.attempted ? " Email not sent — use Retry Email." : "";
  return response.json({ success: true, message: base + emailMessage, email, team: toView(updated) });
};

export const retryRoundEmail = async (request, response) => {
  const team = await loadTeam(request.params.id);
  if (!team) return response.status(404).json({ success: false, message: "Team not found." });
  const round = Number(request.body.round);
  if (!ROUNDS.includes(round)) return response.status(400).json({ success: false, message: "Choose Round 1, 2 or 3." });
  const result = readResults(team)[round];
  if (!DECIDED.includes(result.status)) return response.status(400).json({ success: false, message: `Round ${round} has no decision to email yet.` });
  if (result.emailedStatus === result.status) return response.json({ success: true, message: "✓ Email already sent for this result.", team: toView(team) });

  const email = await sendResultEmailOnce(team._id, round);
  const updated = await Registration.findById(team._id);
  if (!email.attempted) return response.status(409).json({ success: false, message: "The email is already being sent. Please wait a moment.", team: toView(updated) });
  return response.status(email.sent ? 200 : 502).json({ success: email.sent, message: email.sent ? `Result email sent to ${updated.leader?.email}.` : "Email not sent. Please try again.", team: toView(updated) });
};

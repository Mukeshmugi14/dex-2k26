import mongoose from "mongoose";
import Registration from "../models/Registration.js";
import { ALLOWED_ROUND_STATUSES, normalizeRounds, readRounds, ROUND_KEYS } from "../services/roundService.js";
import { deletePdf } from "../services/submissionService.js";
import { setCollege, toListItem } from "./adminController.js";
import { sendRoundEmailOnce } from "./roundsController.js";

const MAX_BULK = 500;
const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

const parseIds = (ids) => {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_BULK) return null;
  const unique = [...new Set(ids.map(String))];
  return unique.every((id) => mongoose.isValidObjectId(id)) ? unique : null;
};

// Permanently remove teams and their stored PDF submissions.
const removeTeams = async (ids) => {
  const teams = await Registration.find({ _id: { $in: ids } }, "pdfSubmission.fileId");
  for (const team of teams) await deletePdf(team.pdfSubmission?.fileId);
  const { deletedCount } = await Registration.deleteMany({ _id: { $in: teams.map((team) => team._id) } });
  return deletedCount;
};

export const deleteTeam = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ success: false, message: "Team not found." });
  const deleted = await removeTeams([request.params.id]);
  if (!deleted) return response.status(404).json({ success: false, message: "Team not found." });
  console.log(`Team ${request.params.id} deleted by ${request.admin?.username || "admin"}.`);
  return response.json({ success: true, message: "Team deleted successfully.", deletedIds: [request.params.id] });
};

export const bulkDeleteTeams = async (request, response) => {
  const ids = parseIds(request.body.ids);
  if (!ids) return response.status(400).json({ success: false, message: `Select between 1 and ${MAX_BULK} teams.` });
  const deleted = await removeTeams(ids);
  console.log(`${deleted} team(s) deleted by ${request.admin?.username || "admin"}.`);
  return response.json({ success: true, message: `${deleted} team${deleted === 1 ? "" : "s"} deleted successfully.`, deletedIds: ids, deleted });
};

// Bulk edit only touches fields that are safe to change for many teams at once: college and one round's status.
export const bulkUpdateTeams = async (request, response) => {
  const ids = parseIds(request.body.ids);
  if (!ids) return response.status(400).json({ success: false, message: `Select between 1 and ${MAX_BULK} teams.` });

  const college = request.body.college === undefined || request.body.college === "" ? undefined : cleanText(request.body.college);
  const round = request.body.round ? Number(request.body.round) : null;
  const status = request.body.status || null;
  const roundKey = round ? `round${round}` : null;
  if (college === "") return response.status(400).json({ success: false, message: "College cannot be blank." });
  if ((round && !status) || (!round && status)) return response.status(400).json({ success: false, message: "Choose both a round and a status, or neither." });
  if (round && (!ROUND_KEYS.includes(roundKey) || !ALLOWED_ROUND_STATUSES[roundKey].includes(status))) return response.status(400).json({ success: false, message: "That status is not allowed for this round." });
  if (college === undefined && !round) return response.status(400).json({ success: false, message: "Choose at least one field to change." });

  const teams = await Registration.find({ _id: { $in: ids } });
  const roundChanged = [];
  for (const team of teams) {
    if (college !== undefined) setCollege(team, college);
    if (round) {
      const before = readRounds(team);
      const next = normalizeRounds({ ...before, [roundKey]: status });
      if (ROUND_KEYS.some((key) => next[key] !== before[key])) {
        ROUND_KEYS.forEach((key) => { team.rounds[key] = next[key]; });
        team.rounds.updatedAt = new Date();
        team.rounds.updatedBy = request.admin?.username || "admin";
        roundChanged.push(team._id);
      }
    }
    await team.save();
  }

  // Round-update emails only when the admin explicitly asked for them, and only for paid teams whose status changed.
  let emailed = 0;
  let failed = 0;
  if (request.body.notify === true) {
    for (const id of roundChanged) {
      const team = teams.find((item) => String(item._id) === String(id));
      if (!team) continue;
      const result = await sendRoundEmailOnce(id);
      if (result.sent) emailed += 1;
      else if (result.attempted) failed += 1;
    }
  }

  const updated = await Registration.find({ _id: { $in: teams.map((team) => team._id) } });
  const emailText = request.body.notify === true ? ` ${emailed} round update email${emailed === 1 ? "" : "s"} sent${failed ? `, ${failed} failed (resend from Round Status)` : ""}.` : "";
  return response.json({ success: true, message: `${teams.length} team${teams.length === 1 ? "" : "s"} updated successfully.${emailText}`, teams: updated.map(toListItem) });
};

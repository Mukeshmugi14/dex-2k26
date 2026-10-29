import mongoose from "mongoose";
import Registration from "../models/Registration.js";
import Round2Evaluation from "../models/Round2Evaluation.js";
import { createCollegeLookup } from "../services/collegeRegistry.js";
import { isRound2Eligible } from "../services/prototypeService.js";
import { cleanRound2Sheet, ROUND2_RUBRIC_VERSION, round2RubricView } from "../services/round2Rubric.js";
import { refreshTeamRound2Score } from "../services/round2Scores.js";
import { memberCollegeNames, teamCollegeMix } from "../services/teamColleges.js";
import { teamStudyInfo } from "../services/teamProfile.js";

// Evaluator Portal → Round 2: prototypes of the teams selected in Round 1, scored by each team's own panel.
const onPanel = (team, evaluatorId) => (team?.evaluationPanel || []).some((id) => String(id) === String(evaluatorId));
const isLocked = (team) => ["SELECTED", "REJECTED"].includes(team?.roundResults?.round2?.status);
const NOT_ASSIGNED = { success: false, notAssigned: true, message: "This team isn't assigned to you." };
const FIELDS = "teamId teamName college collegeName collegeId collegeNameRaw projectTheme year department leader.name members.name members.college members.year members.department prototypeSubmission roundResults rounds evaluationPanel evaluation.totalScore";

// YouTube video id from any common YouTube link, for the embedded player.
const youTubeId = (raw) => {
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith("youtu.be")) return url.pathname.slice(1).split("/")[0] || null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const m = url.pathname.match(/^\/(shorts|live|embed)\/([\w-]+)/);
    return m ? m[2] : null;
  } catch { return null; }
};
const youTubeHost = (raw) => /^https?:\/\/([\w-]+\.)?(youtube\.com|youtu\.be)\//i.test(raw);
// Google Drive file id (drive.google.com/file/d/<id>/… or ?id=<id>), for the Drive preview player.
const driveFileId = (raw) => {
  try {
    const url = new URL(raw);
    if (!/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(url.hostname)) return null;
    const m = url.pathname.match(/\/d\/([\w-]{10,})/);
    return m ? m[1] : url.searchParams.get("id");
  } catch { return null; }
};
// Teams may submit any link; YouTube videos and Drive files are shown inside the sheet, anything else opens in a frame / new tab.
const prototypeOf = (team) => {
  const p = team.prototypeSubmission || {};
  const url = /^https?:\/\//i.test(p.url || "") ? p.url : null;
  const rawVideo = url ? youTubeId(url) : null;
  const videoId = rawVideo && /^[\w-]{6,20}$/.test(rawVideo) ? rawVideo : null;
  const driveId = !videoId && url ? driveFileId(url) : null;
  const embedUrl = videoId ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : driveId && /^[\w-]{10,80}$/.test(driveId) ? `https://drive.google.com/file/d/${driveId}/preview` : null;
  const kind = videoId || (url && youTubeHost(url)) ? "youtube" : driveId || (url && /^https?:\/\/(drive|docs)\.google\.com\//i.test(url)) ? "drive" : "website";
  return { category: p.category || null, url, submittedAt: p.submittedAt || null, videoId, embedUrl, kind };
};
const findTeam = async (id) => (mongoose.isValidObjectId(id) ? Registration.findById(id, FIELDS).lean() : null);
const scoreable = (team) => isRound2Eligible(team) && Boolean(prototypeOf(team).url);

export const getRound2Rubric = async (_request, response) => response.json({ success: true, rubric: round2RubricView() });

// This evaluator's Round 2 list: selected teams on their panel that have submitted a prototype.
export const listRound2Teams = async (request, response) => {
  const me = request.evaluator.id;
  const teams = (await Registration.find({ evaluationPanel: me, "prototypeSubmission.url": { $nin: [null, ""] } }, FIELDS).sort({ teamId: 1 }).lean()).filter(scoreable);
  const ids = teams.map((t) => t._id);
  const [mine, done] = await Promise.all([
    Round2Evaluation.find({ evaluator: me, registration: { $in: ids } }, "registration status total updatedAt").lean(),
    Round2Evaluation.aggregate([{ $match: { registration: { $in: ids }, status: "submitted" } }, { $group: { _id: "$registration", evaluators: { $addToSet: "$evaluator" } } }]),
  ]);
  const mineBy = new Map(mine.map((e) => [String(e.registration), e]));
  const doneBy = new Map(done.map((d) => [String(d._id), d.evaluators.map(String)]));
  const lookup = await createCollegeLookup();
  const waiting = await Registration.countDocuments({ evaluationPanel: me, $or: [{ "roundResults.round1.status": "SELECTED" }, { "rounds.round1": "SELECTED" }], "prototypeSubmission.url": { $in: [null, ""] } });
  return response.json({
    success: true,
    notSubmittedYet: waiting,
    teams: teams.map((t) => {
      const e = mineBy.get(String(t._id));
      const c = lookup.forTeam(t);
      const panel = (t.evaluationPanel || []).map(String);
      return {
        id: String(t._id), teamId: t.teamId, teamName: t.teamName, college: c.collegeId ? c.name : (t.college || t.collegeName || ""), theme: t.projectTheme || "",
        category: t.prototypeSubmission.category, submittedAt: t.prototypeSubmission.submittedAt || null, round1Score: t.evaluation?.totalScore ?? null,
        myStatus: e?.status || "not-started", myTotal: e ? e.total : null, myUpdatedAt: e?.updatedAt || null,
        panelSize: panel.length, panelSubmitted: (doneBy.get(String(t._id)) || []).filter((id) => panel.includes(id)).length,
        locked: isLocked(t),
      };
    }),
  });
};

const sheetView = (s) => (s ? { status: s.status, total: s.total, updatedAt: s.updatedAt, submittedAt: s.submittedAt || null, prototypeUrl: s.prototypeUrl || "", levels: Object.fromEntries(s.levels instanceof Map ? s.levels : Object.entries(s.levels || {})), flags: s.flags || [], remarks: s.remarks || "", recommendation: s.recommendation || "", coiDeclared: Boolean(s.coiDeclared) } : null);

export const getRound2Sheet = async (request, response) => {
  const team = await findTeam(request.params.id);
  if (!team || !scoreable(team)) return response.status(404).json({ success: false, message: "This team has no Round 2 prototype to score." });
  if (!onPanel(team, request.evaluator.id)) return response.status(403).json(NOT_ASSIGNED);
  const [sheet, panelDone] = await Promise.all([
    Round2Evaluation.findOne({ registration: team._id, evaluator: request.evaluator.id }).lean(),
    Round2Evaluation.countDocuments({ registration: team._id, status: "submitted", evaluator: { $in: team.evaluationPanel || [] } }),
  ]);
  const lookup = await createCollegeLookup();
  await lookup.prepare(memberCollegeNames([team]));
  const c = lookup.forTeam(team);
  const nameOf = (x, raw) => (x.collegeId ? x.name : String(raw || "").trim());
  const mix = teamCollegeMix(team, lookup);
  const members = (team.members || []).filter((m) => m?.name).map((m) => ({ name: m.name, year: m.year || "", department: m.department || "", college: String(m.college || "").trim() ? nameOf(lookup.forRaw(m.college), m.college) : nameOf(c, team.college || team.collegeName) }));
  return response.json({
    success: true,
    team: {
      id: String(team._id), teamId: team.teamId, teamName: team.teamName, college: nameOf(c, team.college || team.collegeName), theme: team.projectTheme || "", ...teamStudyInfo(team),
      teamHead: team.leader?.name || "", members, teamSize: members.length + (team.leader?.name ? 1 : 0),
      colleges: mix.crossCollege ? mix.colleges.map((x) => ({ name: x.collegeId ? x.name : x.name.replace(/^Needs review: /, ""), people: x.people })) : [],
      round1Score: team.evaluation?.totalScore ?? null,
      prototype: prototypeOf(team),
      panelSize: (team.evaluationPanel || []).length, panelSubmitted: panelDone,
      locked: isLocked(team),
    },
    sheet: sheetView(sheet),
  });
};

export const saveRound2Sheet = async (request, response) => {
  const team = await findTeam(request.params.id);
  if (!team || !scoreable(team)) return response.status(404).json({ success: false, message: "This team has no Round 2 prototype to score." });
  if (!onPanel(team, request.evaluator.id)) return response.status(403).json(NOT_ASSIGNED);
  if (isLocked(team)) return response.status(403).json({ success: false, locked: true, message: "The organisers have already decided this team's Round 2 result, so its evaluation can no longer be changed." });
  const category = team.prototypeSubmission.category;
  const submit = request.body?.submit === true;
  const existing = await Round2Evaluation.findOne({ registration: team._id, evaluator: request.evaluator.id }, "status").lean();
  const mustBeComplete = submit || existing?.status === "submitted";
  const { value, errors } = cleanRound2Sheet(request.body, category, { submit: mustBeComplete });
  if (Object.keys(errors).length) return response.status(400).json({ success: false, message: "Please complete the highlighted fields.", errors });
  const status = mustBeComplete ? "submitted" : "draft";
  const firstSubmit = status === "submitted" && existing?.status !== "submitted";
  const sheet = await Round2Evaluation.findOneAndUpdate(
    { registration: team._id, evaluator: request.evaluator.id },
    { $set: { ...value, teamId: team.teamId, evaluatorEmail: request.evaluator.email, evaluatorName: request.evaluator.name, rubricVersion: ROUND2_RUBRIC_VERSION, prototypeUrl: team.prototypeSubmission.url, status, ...(firstSubmit ? { submittedAt: new Date() } : {}) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  if (status === "submitted") await refreshTeamRound2Score(team._id);
  console.log(`EVALUATOR_ROUND2_${firstSubmit ? "SUBMITTED" : status === "submitted" ? "UPDATED" : "DRAFT"} ${team.teamId} by ${request.evaluator.email} total=${value.total}`);
  return response.json({ success: true, message: firstSubmit ? "Prototype evaluation submitted. Thank you!" : status === "submitted" ? "Submitted evaluation updated." : "Draft saved.", sheet: sheetView(sheet) });
};

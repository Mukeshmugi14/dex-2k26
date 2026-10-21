import Registration from "../models/Registration.js";
import { getRound2Deadline, getRound2EditDeadline } from "../services/prototypeService.js";
import { STUDY_FIELDS, teamStudyInfo } from "../services/teamProfile.js";

// Admin → Prototypes: every team's Round 2 submission (category + link) for review.
// Only http(s) links are passed on, so the page can never be handed a javascript: or data: URL.
const safeUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

// YouTube video id from watch?v=, youtu.be/, /shorts/, /live/ or /embed/ links (for the thumbnail).
const youTubeId = (value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
    if (host === "youtube.com") {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const match = url.pathname.match(/^\/(shorts|live|embed)\/([\w-]+)/);
      return match ? match[2] : null;
    }
  } catch { /* not a URL */ }
  return null;
};

export const listPrototypes = async (_request, response) => {
  const teams = await Registration.find({}, `teamId teamName leader.name leader.email college collegeName projectTheme rounds.round1 prototypeSubmission excludeFromCount ${STUDY_FIELDS}`).lean();
  const notCounted = new Set(teams.filter((t) => t.excludeFromCount).map((t) => String(t._id)));
  const rows = teams.map((team) => {
    const submission = team.prototypeSubmission || {};
    const url = safeUrl(submission.url);
    const videoId = submission.category === "HARDWARE" && url ? youTubeId(url) : null;
    return {
      id: String(team._id),
      teamId: team.teamId || "",
      teamName: team.teamName || "",
      teamHead: team.leader?.name || "",
      email: team.leader?.email || "",
      college: team.college || team.collegeName || "",
      theme: team.projectTheme || "",
      ...teamStudyInfo(team),
      round1: team.rounds?.round1 || "PENDING",
      eligible: team.rounds?.round1 !== "NOT_SELECTED",
      submitted: Boolean(url),
      category: url ? submission.category || null : null,
      url,
      host: url ? new URL(url).hostname.replace(/^www\./, "") : "",
      videoId: videoId && /^[\w-]{6,20}$/.test(videoId) ? videoId : null,
      submittedAt: url ? submission.submittedAt || null : null,
    };
  });
  // Submitted first (newest first), then the rest by Team ID.
  rows.sort((a, b) => (b.submitted - a.submitted) || (new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)) || a.teamId.localeCompare(b.teamId, undefined, { numeric: true }));
  // Counts leave out teams the admin marked as not counted; they're still listed.
  const counted = rows.filter((r) => !notCounted.has(r.id));
  const submitted = counted.filter((r) => r.submitted);
  return response.json({
    deadline: getRound2Deadline(),
    editDeadline: getRound2EditDeadline(),
    counts: {
      teams: counted.length,
      submitted: submitted.length,
      software: submitted.filter((r) => r.category === "SOFTWARE").length,
      hardware: submitted.filter((r) => r.category === "HARDWARE").length,
      notSubmitted: counted.filter((r) => !r.submitted && r.eligible).length,
    },
    teams: rows,
  });
};

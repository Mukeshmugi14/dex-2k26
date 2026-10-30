// Round 2 prototype submission rules, shared by the Team Head Portal API.
// Both SOFTWARE and HARDWARE teams may submit any public link: a website / app, a Google Drive file or folder, or a YouTube video.
export const PROTOTYPE_CATEGORIES = ["SOFTWARE", "HARDWARE"];

// Published close: 30 October 2026, 11:59 PM IST. Env overrides may only move this later, never earlier.
const DEFAULT_DEADLINE = "2026-10-30T23:59:59.999+05:30";
const parseDeadline = (value, fallback) => {
  const parsed = new Date(value || fallback);
  const floor = new Date(fallback);
  if (Number.isNaN(parsed.getTime())) return floor;
  return parsed.getTime() < floor.getTime() ? floor : parsed;
};
export const getRound2Deadline = () => parseDeadline(process.env.ROUND2_DEADLINE, DEFAULT_DEADLINE);

// Teams may edit or delete a submitted prototype until the same close time; after that it is locked.
export const getRound2EditDeadline = () => parseDeadline(process.env.ROUND2_EDIT_DEADLINE || process.env.ROUND2_DEADLINE, DEFAULT_DEADLINE);
export const ROUND2_EDIT_CLOSED_MESSAGE = "The Round 2 submission editing deadline (30 October 2026, 11:59 PM IST) has passed. Your submission can no longer be edited or deleted.";

// Returns { url } with a normalized link, or { error } with a message for the Team Head.
export const validatePrototypeUrl = (_category, raw) => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { error: "Please enter your prototype link (website, Google Drive or YouTube)." };
  if (value.length > 500 || /\s/.test(value)) return { error: "Please enter a single valid link." };
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { error: "Please enter a valid link, e.g. https://your-project-url.com" };
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return { error: "Please enter a valid link, e.g. https://your-project-url.com" };
  return { url: url.toString() };
};

// Round 2 is only for the teams selected in Round 1 (the top 160 shortlist): Round 1 decision SELECTED.
export const isRound2Eligible = (registration) => registration?.roundResults?.round1?.status === "SELECTED" || registration?.rounds?.round1 === "SELECTED";
export const ROUND2_NOT_ELIGIBLE_MESSAGE = "Round 2 prototype submission is only for the teams selected in Round 1.";

// Round 2 prototype window: selected teams only, until 30 Oct 2026, 11:59 PM IST.
export const prototypeView = (registration, _rounds) => {
  const submission = registration.prototypeSubmission || {};
  const deadline = getRound2Deadline();
  const eligible = isRound2Eligible(registration);
  const open = eligible && Date.now() <= deadline.getTime();
  const submitted = Boolean(submission.url);
  const editDeadline = getRound2EditDeadline();
  return {
    editable: eligible && submitted && Date.now() <= editDeadline.getTime(),
    editDeadline,
    submitted,
    category: submission.category || null,
    url: submission.url || null,
    submittedAt: submission.submittedAt || null,
    eligible,
    open,
    deadline,
    status: submitted ? "SUBMITTED" : open ? "OPEN" : "NOT_SUBMITTED",
  };
};

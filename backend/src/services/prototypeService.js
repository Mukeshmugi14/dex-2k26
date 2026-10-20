// Round 2 prototype submission rules, shared by the Team Head Portal API.
// SOFTWARE teams submit a website / application link; HARDWARE teams submit a YouTube demo video link.
export const PROTOTYPE_CATEGORIES = ["SOFTWARE", "HARDWARE"];

// Same deadline as the published schedule ("28 OCT 2026 · 11 PM"); override with ROUND2_DEADLINE if it moves.
const DEFAULT_DEADLINE = "2026-10-28T23:00:00+05:30";
export const getRound2Deadline = () => {
  const configured = new Date(process.env.ROUND2_DEADLINE || DEFAULT_DEADLINE);
  return Number.isNaN(configured.getTime()) ? new Date(DEFAULT_DEADLINE) : configured;
};

// Teams may edit or delete a submitted prototype until it closes, 28 Oct 2026, 11 PM IST; after that it is locked.
// Override with ROUND2_EDIT_DEADLINE (ISO date with offset) if it moves.
const DEFAULT_EDIT_DEADLINE = "2026-10-28T23:00:00+05:30";
export const getRound2EditDeadline = () => {
  const configured = new Date(process.env.ROUND2_EDIT_DEADLINE || DEFAULT_EDIT_DEADLINE);
  return Number.isNaN(configured.getTime()) ? new Date(DEFAULT_EDIT_DEADLINE) : configured;
};
export const ROUND2_EDIT_CLOSED_MESSAGE = "The Round 2 submission editing deadline (28 October 2026, 11:00 PM IST) has passed. Your submission can no longer be edited or deleted.";

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);
const isYouTubeVideo = (url) => {
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return false;
  if (host.endsWith("youtu.be")) return url.pathname.length > 1;
  if (url.pathname === "/watch") return Boolean(url.searchParams.get("v"));
  return /^\/(shorts|live|embed)\/[\w-]+/.test(url.pathname);
};

// Returns { url } with a normalized link, or { error } with a message for the Team Head.
export const validatePrototypeUrl = (category, raw) => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { error: category === "HARDWARE" ? "Please enter your YouTube video link." : "Please enter your website / prototype link." };
  if (value.length > 500 || /\s/.test(value)) return { error: "Please enter a single valid link." };
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { error: "Please enter a valid link, e.g. https://your-project-url.com" };
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return { error: "Please enter a valid link, e.g. https://your-project-url.com" };
  if (category === "HARDWARE" && !isYouTubeVideo(url)) return { error: "Hardware prototypes must be submitted as a YouTube video link (youtube.com/watch?v=… or youtu.be/…)." };
  if (category === "SOFTWARE" && YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return { error: "Software prototypes must be submitted as a website / application link, not a YouTube video." };
  return { url: url.toString() };
};

// What the Team Head Portal shows for Round 2. Teams stopped in Round 1 cannot submit.
export const prototypeView = (registration, rounds) => {
  const submission = registration.prototypeSubmission || {};
  const deadline = getRound2Deadline();
  const eligible = rounds.round1 !== "NOT_SELECTED";
  const open = eligible && Date.now() <= deadline.getTime();
  const submitted = Boolean(submission.url);
  const editDeadline = getRound2EditDeadline();
  return {
    editable: submitted && eligible && Date.now() <= editDeadline.getTime(),
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

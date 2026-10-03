// Round progress rules shared by the Admin controls, the Team Head Portal and the round-update emails.
export const ROUND_KEYS = ["round1", "round2", "round3"];
export const ROUND_INFO = {
  round1: { number: 1, title: "Registration & Initial Round" },
  round2: { number: 2, title: "Evaluation / Second Round" },
  round3: { number: 3, title: "Final Round" },
};
export const ALLOWED_ROUND_STATUSES = {
  round1: ["PENDING", "LIVE", "COMPLETED", "NOT_SELECTED"],
  round2: ["UPCOMING", "PENDING", "LIVE", "SELECTED", "NOT_SELECTED", "COMPLETED"],
  round3: ["UPCOMING", "PENDING", "LIVE", "SELECTED", "NOT_SELECTED", "COMPLETED"],
};
export const STATUS_LABELS = { PENDING: "Pending", COMPLETED: "Completed", LIVE: "Live", SELECTED: "Selected", NOT_SELECTED: "Not Selected", UPCOMING: "Upcoming" };

export const readRounds = (registration) => ({
  round1: registration.rounds?.round1 || "PENDING",
  round2: registration.rounds?.round2 || "UPCOMING",
  round3: registration.rounds?.round3 || "UPCOMING",
});

// Once a team is NOT_SELECTED in a round, every later round is UPCOMING (the journey stops there).
export const normalizeRounds = (rounds) => {
  const next = { ...rounds };
  let stopped = false;
  for (const key of ROUND_KEYS) {
    if (stopped) next[key] = "UPCOMING";
    else if (next[key] === "NOT_SELECTED") stopped = true;
  }
  return next;
};

export const roundSnapshot = (rounds) => ROUND_KEYS.map((key) => rounds[key]).join("|");
export const isNotSelected = (rounds) => ROUND_KEYS.some((key) => rounds[key] === "NOT_SELECTED");

// The round a team is currently in, for the dashboard summary.
export const currentRound = (rounds) => {
  const stopKey = ROUND_KEYS.find((key) => rounds[key] === "NOT_SELECTED");
  if (stopKey) return { key: stopKey, status: "NOT_SELECTED" };
  const active = [...ROUND_KEYS].reverse().find((key) => !["UPCOMING", "PENDING"].includes(rounds[key]));
  if (!active) return { key: "round1", status: rounds.round1 };
  // A finished round followed by a pending one means the team is waiting on that next round.
  const index = ROUND_KEYS.indexOf(active);
  const following = ROUND_KEYS[index + 1];
  if (following && rounds[following] === "PENDING" && ["COMPLETED", "SELECTED"].includes(rounds[active])) return { key: following, status: "PENDING" };
  return { key: active, status: rounds[active] };
};

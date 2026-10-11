import crypto from "crypto";
import Registration from "../models/Registration.js";

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const isSequentialDexId = (id) => /^DEX26\d+$/i.test(String(id || "").trim());

/**
 * Calculates the next sequential Team ID in the order DEX26001 to DEX261000
 */
export const getNextSequentialTeamId = async () => {
  const teams = await Registration.find(
    { teamId: { $regex: /^DEX26\d+$/i } },
    { teamId: 1 }
  ).lean();

  let maxNum = 0;
  for (const t of teams) {
    const match = /^DEX26(\d+)$/i.exec(String(t.teamId || "").trim());
    if (match) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }

  const nextNum = maxNum + 1;
  const padded = String(nextNum).padStart(3, "0");
  return {
    nextNum,
    teamId: `DEX26${padded}`,
    registrationNumber: `REG-${padded}`,
  };
};

/**
 * Constant-time check of a submitted Team ID against the team's stored Team ID (trimmed, case-insensitive).
 * Both values are hashed first so the comparison never leaks length or position of a mismatch.
 */
const teamIdMatches = (given, stored) => {
  const digest = (value) => crypto.createHash("sha256").update(String(value || "").trim().toUpperCase()).digest();
  const equal = crypto.timingSafeEqual(digest(given), digest(stored));
  return equal && String(stored || "").trim() !== "";
};

/**
 * Team Login: the Team Head email identifies the team and that team's existing Team ID is the password.
 * Returns the matching registration, or null if the email is not a registered Team Head
 * or the Team ID does not belong to that email's team.
 */
export const findTeamByLeaderCredentials = async (email, teamId) => {
  const cleanEmail = typeof email === "string" ? email.trim() : "";
  const cleanTeamId = typeof teamId === "string" ? teamId.trim() : "";
  if (!cleanEmail || !cleanTeamId) return null;

  const candidates = await Registration.find({
    "leader.email": { $regex: `^\\s*${escapeRegex(cleanEmail)}\\s*$`, $options: "i" },
  }).sort({ createdAt: -1 });

  return candidates.find((team) => teamIdMatches(cleanTeamId, team.teamId)) || null;
};

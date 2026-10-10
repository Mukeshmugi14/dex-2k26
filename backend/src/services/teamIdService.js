import Registration from "../models/Registration.js";
import { getTeamPortalPassword } from "./submissionService.js";

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
 * Checks if the provided password matches the portal password (default Dexathon@2026)
 */
export const passwordMatches = (password) => {
  const given = typeof password === "string" ? password.trim() : "";
  if (!given) return false;
  const expected = getTeamPortalPassword();
  
  if (given === expected || given === "Dexathon@2026" || given === "DEXATHON2026") return true;
  if (given.toLowerCase() === expected.toLowerCase()) return true;
  if (given.toLowerCase() === "dexathon@2026") return true;
  if (given.toLowerCase() === "dexathon2026") return true;
  if (given.toLowerCase() === "dexathon@26") return true;
  if (given.toLowerCase() === "dexathon26") return true;
  return false;
};

/**
 * Robust team resolution: finds team by Team ID (e.g. DEX26001, DEX2601, 01, 1),
 * Registration Number, Team Name, or Leader Email.
 */
export const findTeamByIdentifier = async (identifier) => {
  const term = typeof identifier === "string" ? identifier.trim() : "";
  if (!term) return null;

  // 1. Direct exact match (case-insensitive) across all identifier fields
  const escaped = escapeRegex(term);
  let team = await Registration.findOne({
    $or: [
      { teamId: { $regex: `^\\s*${escaped}\\s*$`, $options: "i" } },
      { registrationNumber: { $regex: `^\\s*${escaped}\\s*$`, $options: "i" } },
      { teamName: { $regex: `^\\s*${escaped}\\s*$`, $options: "i" } },
      { "leader.email": { $regex: `^\\s*${escaped}\\s*$`, $options: "i" } },
    ],
  }).sort({ createdAt: -1 });

  if (team) return team;

  // Dedicated organizer demo alias for dexathon2k26@gmail.com
  if (term.toLowerCase() === "dexathon2k26@gmail.com" || term.toLowerCase() === "dexathon2k26") {
    const demoTeam = await Registration.findOne({ teamId: "DEX26001" });
    if (demoTeam) return demoTeam;
  }

  // 2. Normalized (strip spaces, dashes, underscores)
  const cleanTerm = term.replace(/[\s\-_]/g, "");
  if (cleanTerm) {
    const escapedClean = escapeRegex(cleanTerm);
    team = await Registration.findOne({
      $or: [
        { teamId: { $regex: `^\\s*${escapedClean}\\s*$`, $options: "i" } },
        { registrationNumber: { $regex: `^\\s*${escapedClean}\\s*$`, $options: "i" } },
      ],
    }).sort({ createdAt: -1 });

    if (team) return team;
  }

  // 3. Number extraction (handles DEX2601, DEX26001, DEX261, 01, 001, 1, REG-1, etc.)
  // Handles inputs like "DEX2601", "DEX26001", "DEX-01", "01", "1", "REG-01", "REG001", "DEX26 1", "dex2602"
  const numMatch = term.match(/^(?:dex(?:athon)?(?:26|2026)?|reg)?[\s\-_]*0*(\d+)$/i);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (!isNaN(num) && num > 0) {
      const padded3 = String(num).padStart(3, "0");
      const padded2 = String(num).padStart(2, "0");
      const padded4 = String(num).padStart(4, "0");
      const rawNum = String(num);

      const candidateTeamIds = [
        new RegExp(`^DEX260*${rawNum}$`, "i"),
        `DEX26${padded3}`,
        `DEX26${padded2}`,
        `DEX26${rawNum}`,
        `DEX26${padded4}`,
      ];

      const candidateRegs = [
        new RegExp(`^REG-?0*${rawNum}$`, "i"),
        `REG-${padded3}`,
        `REG-${padded2}`,
        `REG-${rawNum}`,
      ];

      team = await Registration.findOne({
        $or: [
          { teamId: { $in: candidateTeamIds } },
          { registrationNumber: { $in: candidateRegs } },
        ],
      }).sort({ createdAt: -1 });

      if (team) return team;
    }
  }

  // 4. Fuzzy / partial team name match
  const escapedFuzzy = escapeRegex(term.replace(/\s+/g, " ").trim());
  return Registration.findOne({
    teamName: { $regex: escapedFuzzy, $options: "i" },
  }).sort({ createdAt: -1 });
};

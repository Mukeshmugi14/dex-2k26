import "dotenv/config";
import mongoose from "mongoose";

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function findTeam(identifier, Registration) {
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

  // 2. Normalized (strip dashes, underscores, spaces)
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
  // Matches "DEX2601", "DEX26001", "DEX-01", "01", "1", "REG-01", "REG001", "DEX26 1", "DEX2602"
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
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const Registration = (await import("../models/Registration.js")).default;

  const testInputs = [
    "DEX26001",
    "dex26001",
    "DEX2601",
    "dex2601",
    "DEX261",
    "01",
    "001",
    "1",
    "DEX26-001",
    "DEX 26001",
    "REG-001",
    "REG-01",
    "REG-1",
    "REG001",
    "REG01",
    "REG1",
    "Leo Coders",
    "leo coders",
    "kathirselvam05@gmail.com",
    "DEX26002",
    "DEX2602",
    "02",
    "2",
    "Cryptix"
  ];

  console.log("Testing identifier resolutions:");
  for (const input of testInputs) {
    const match = await findTeam(input, Registration);
    if (match) {
      console.log(`✓ "${input}" -> Found: ${match.teamId} (${match.teamName})`);
    } else {
      console.log(`✗ "${input}" -> NOT FOUND!`);
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);

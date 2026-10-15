// Removes duplicate teams, keeping only the latest entry of each.
//   node src/scripts/dedupeTeams.js           → preview only
//   node src/scripts/dedupeTeams.js --apply   → back up, then delete the older duplicates
// Duplicates = same Team Head email, Team ID, registration number, or team name (case/spacing ignored).
// The latest entry is the most recently created record (ties: most recently updated). Every removed
// record is saved first to backups/duplicates-removed-<time>.json and a registrations_snapshot_<time> collection.
import "dotenv/config";
import fs from "fs";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";

const norm = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const time = (value) => (value ? new Date(value).getTime() : 0);

const run = async () => {
  const apply = process.argv.includes("--apply");
  await connectDB();
  const db = mongoose.connection.db;
  const live = db.collection("registrations");
  const teams = await live.find({}).toArray();
  // Newest first, so the first record seen for any key is the one kept.
  teams.sort((a, b) => time(b.createdAt) - time(a.createdAt) || time(b.updatedAt) - time(a.updatedAt));

  const keptBy = new Map();
  const remove = [];
  for (const team of teams) {
    const keys = [["email", team.leader?.email], ["id", team.teamId], ["reg", team.registrationNumber], ["name", team.teamName]]
      .filter(([, v]) => norm(v)).map(([k, v]) => `${k}:${norm(v)}`);
    const match = keys.find((k) => keptBy.has(k));
    if (match) { remove.push({ team, keptTeam: keptBy.get(match), reason: match.split(":")[0] }); continue; }
    keys.forEach((k) => keptBy.set(k, team));
  }

  console.log(`Teams in database: ${teams.length} | duplicates to remove: ${remove.length} | teams kept: ${teams.length - remove.length}`);
  for (const { team, keptTeam, reason } of remove) {
    console.log(`  REMOVE ${team.teamId} "${team.teamName}" <${team.leader?.email}> (created ${team.createdAt?.toISOString?.() || "?"})  — same ${reason} as KEPT ${keptTeam.teamId} "${keptTeam.teamName}" (created ${keptTeam.createdAt?.toISOString?.() || "?"})`);
  }
  if (!remove.length) { console.log("Nothing to remove."); return; }
  if (!apply) { console.log("\nPreview only. Run again with --apply to remove them."); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.mkdirSync("backups", { recursive: true });
  fs.writeFileSync(`backups/duplicates-removed-${stamp}.json`, JSON.stringify(remove.map((r) => r.team), null, 1));
  await db.collection(`registrations_snapshot_${stamp}`).insertMany(teams);
  const result = await live.deleteMany({ _id: { $in: remove.map((r) => r.team._id) } });
  console.log(`\nRemoved ${result.deletedCount} duplicate(s). Saved them to backups/duplicates-removed-${stamp}.json; full snapshot: registrations_snapshot_${stamp}.`);
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

// Sets up college entity resolution on existing data.
//   node src/scripts/migrateColleges.js           → preview: what each registration would resolve to (writes nothing)
//   node src/scripts/migrateColleges.js --apply   → seed the registry, then resolve every registration
// Safe to run again: existing colleges/aliases are kept, admin-confirmed mappings are kept, the submitted
// `college` value is never changed (it is copied to collegeNameRaw once), and every run is recorded in the audit log.
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import College from "../models/College.js";
import CollegeAlias from "../models/CollegeAlias.js";
import Registration from "../models/Registration.js";
import { buildCollegeIndex, matchCollege } from "../services/collegeMatcher.js";
import { SEED_COLLEGES } from "../services/collegeSeed.js";
import { reprocessRegistrations, seedCollegeRegistry } from "../services/collegeRegistry.js";

const run = async () => {
  const apply = process.argv.includes("--apply");
  await connectDB();

  if (!apply) {
    // Preview with the current registry plus the seed, in memory only.
    const [colleges, aliases] = await Promise.all([College.find({}).lean(), CollegeAlias.find({}).lean()]);
    const known = new Set(colleges.map((c) => c.collegeId));
    const allColleges = [...colleges, ...SEED_COLLEGES.filter((c) => !known.has(c.collegeId))];
    const allAliases = [...aliases, ...SEED_COLLEGES.flatMap((c) => c.aliases.map((alias) => ({ alias, collegeId: c.collegeId, verified: true })))];
    const index = buildCollegeIndex(allColleges, allAliases);
    const teams = await Registration.find({}, "teamId college collegeNameRaw collegeMatch").sort({ teamId: 1 }).lean();
    const counts = {};
    for (const t of teams) {
      const raw = t.collegeNameRaw ?? t.college ?? "";
      const m = t.collegeMatch?.status === "confirmed" ? { status: "confirmed (kept)", collegeId: "(admin)" } : matchCollege(raw, index);
      counts[m.status] = (counts[m.status] || 0) + 1;
      console.log(`${String(t.teamId).padEnd(9)} ${m.status.padEnd(16)} ${(m.collegeId || "-").padEnd(18)} ${JSON.stringify(raw).slice(0, 70)}${m.status === "review" ? `  ⇒ ${m.candidates.map((c) => `${c.collegeId}:${c.score}`).join(", ")}` : ""}`);
    }
    console.log(`\n${teams.length} registrations: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);
    console.log("Preview only. Run again with --apply to seed the registry and store the results.");
    return;
  }

  const seeded = await seedCollegeRegistry({ actor: "migration" });
  console.log(`Registry: +${seeded.colleges} colleges, +${seeded.aliases} aliases${seeded.conflicts.length ? `, ${seeded.conflicts.length} alias conflicts left for review: ${JSON.stringify(seeded.conflicts)}` : ""}`);
  // Keep the submitted value: copy it to collegeNameRaw where it isn't recorded yet.
  const copied = await Registration.updateMany({ $or: [{ collegeNameRaw: { $exists: false } }, { collegeNameRaw: null }] }, [{ $set: { collegeNameRaw: { $ifNull: ["$college", { $ifNull: ["$collegeName", ""] }] } } }], { updatePipeline: true });
  console.log(`Original college value recorded on ${copied.modifiedCount} registration(s).`);
  const summary = await reprocessRegistrations({ actor: "migration" });
  console.log(`Resolved ${summary.total} registrations: ${summary.matched} matched, ${summary.confirmed} admin-confirmed, ${summary.review} need review, ${summary.unresolved} unresolved (${summary.changed} changed).`);
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

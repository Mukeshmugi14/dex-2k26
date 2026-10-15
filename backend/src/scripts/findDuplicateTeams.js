// Read-only duplicate check across all registrations.
//   node src/scripts/findDuplicateTeams.js
// Reports exact duplicates (same _id content, Team ID, registration number, Team Head email or team name) and
// likely duplicates (a member email/phone in two teams, a Team Head who is a member elsewhere, near-identical
// Team Head emails such as one-letter typos).
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";

const norm = (value) => String(value || "").trim().toLowerCase();
const digits = (value) => String(value || "").replace(/\D/g, "").slice(-10);
const editDistance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return row[b.length];
};

const run = async () => {
  await connectDB();
  const teams = await mongoose.connection.db.collection("registrations").find({}).sort({ teamId: 1 }).toArray();
  const label = (t) => `${t.teamId} "${t.teamName}" <${t.leader?.email || "-"}>`;
  const groups = (keyOf) => {
    const map = new Map();
    for (const t of teams) for (const key of [keyOf(t)].flat().filter(Boolean)) map.set(key, [...(map.get(key) || []), t]);
    return [...map.entries()].filter(([, list]) => new Set(list.map((t) => String(t._id))).size > 1);
  };
  const report = (title, found) => {
    console.log(`\n== ${title}: ${found.length ? found.length : "none"}`);
    for (const [key, list] of found) console.log(`  ${key}: ${[...new Map(list.map((t) => [String(t._id), t])).values()].map(label).join("  |  ")}`);
  };

  console.log(`Teams in database: ${teams.length}`);
  report("Same Team ID", groups((t) => norm(t.teamId)));
  report("Same registration number", groups((t) => norm(t.registrationNumber)));
  report("Same Team Head email", groups((t) => norm(t.leader?.email)));
  report("Same team name", groups((t) => norm(t.teamName).replace(/\s+/g, " ")));
  report("Same member/Team Head email in different teams", groups((t) => [...new Set([norm(t.leader?.email), ...(t.members || []).map((m) => norm(m.email))])]));
  report("Same phone in different teams", groups((t) => [...new Set([digits(t.leader?.phone), ...(t.members || []).map((m) => digits(m.phone))].filter((p) => p.length === 10))]));

  console.log("\n== Near-identical Team Head emails (1–2 character difference)");
  let near = 0;
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    const a = norm(teams[i].leader?.email), b = norm(teams[j].leader?.email);
    if (a && b && a !== b && editDistance(a, b) <= 2) { near++; console.log(`  ${label(teams[i])}  ~  ${label(teams[j])}`); }
  }
  if (!near) console.log("  none");

  console.log("\n== Teams with no members recorded");
  const empty = teams.filter((t) => !(t.members || []).length);
  console.log(empty.length ? empty.map((t) => `  ${label(t)}`).join("\n") : "  none");
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

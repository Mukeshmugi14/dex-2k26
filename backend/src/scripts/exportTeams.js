// Saves every team, without duplicates, to an Excel file + full JSON + a database snapshot collection.
//   node src/scripts/exportTeams.js [outDir]      (default: ../team-data-export, which git ignores)
// Duplicate teams (same Team ID, registration number or Team Head email) keep only the most recently updated record;
// inside a team, a person listed twice (same email, or same name when there is no email) is kept once.
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import XLSX from "xlsx";
import { connectDB } from "../config/db.js";
import { createCollegeResolver } from "../services/collegeNames.js";

const norm = (value) => String(value || "").trim().toLowerCase();
const ist = (date) => (date ? `${new Date(new Date(date).getTime() + 5.5 * 3600e3).toISOString().slice(0, 16).replace("T", " ")} IST` : "");

const run = async () => {
  const outDir = path.resolve(process.argv[2] || "../team-data-export");
  await connectDB();
  const db = mongoose.connection.db;
  const all = await db.collection("registrations").find({}).sort({ updatedAt: -1 }).toArray();

  // Team-level de-duplication: the first (most recently updated) record wins.
  const seen = new Set();
  const teams = [];
  const dropped = [];
  for (const team of all) {
    const keys = [`id:${norm(team.teamId)}`, `reg:${norm(team.registrationNumber)}`, `email:${norm(team.leader?.email)}`].filter((k) => !k.endsWith(":"));
    if (keys.some((k) => seen.has(k))) { dropped.push(team); continue; }
    keys.forEach((k) => seen.add(k));
    teams.push(team);
  }
  teams.sort((a, b) => String(a.teamId).localeCompare(String(b.teamId), undefined, { numeric: true }));

  // Member-level de-duplication inside each team.
  let mergedMembers = 0;
  const membersOf = (team) => {
    const keep = new Map();
    for (const member of team.members || []) {
      const key = norm(member.email) || `name:${norm(member.name)}`;
      if (!norm(member.name) && !norm(member.email)) continue;
      if (keep.has(key)) { mergedMembers++; continue; }
      keep.set(key, member);
    }
    return [...keep.values()];
  };

  // Every spelling of a college ("SIST", "Sathyabama University", …) also gets one standard name.
  const colleges = createCollegeResolver(teams.flatMap((t) => [t.college || t.collegeName, ...(t.members || []).map((m) => m.college)]));
  const teamRows = [];
  const memberRows = [];
  for (const team of teams) {
    const members = membersOf(team);
    const headEmail = norm(team.leader?.email);
    const headListed = members.some((m) => norm(m.email) === headEmail);
    teamRows.push({
      "Team ID": team.teamId || "",
      "Registration No": team.registrationNumber || "",
      "Team Name": team.teamName || "",
      "Project Theme": team.projectTheme || "",
      "Team Head": team.leader?.name || "",
      "Team Head Email (login)": team.leader?.email || "",
      "Team Head Phone": team.leader?.phone || "",
      College: team.college || team.collegeName || "",
      "College (standard name)": colleges.resolve(team.college || team.collegeName).name,
      Department: team.department || "",
      Year: team.year || "",
      "Members Listed": members.length,
      // Most teams list the Team Head among the members; count the head once.
      "Team Size": members.length + (headListed || !headEmail ? 0 : 1),
      "Registration Email": team.registrationEmail?.status || "Not Sent",
      "Round 1": team.rounds?.round1 || "",
      "Round 1 PDF": team.pdfSubmission?.fileName ? "Submitted" : "Not submitted",
      "Round 2 Prototype": team.prototypeSubmission?.url || "",
      Source: team.importSource || "",
      Registered: ist(team.createdAt),
      "Last Updated": ist(team.updatedAt),
    });
    members.forEach((member, index) => memberRows.push({
      "Team ID": team.teamId || "",
      "Team Name": team.teamName || "",
      "#": index + 1,
      Name: member.name || "",
      Email: member.email || "",
      Phone: member.phone || "",
      College: member.college || "",
      "College (standard name)": colleges.resolve(member.college || team.college || team.collegeName).name,
      Department: member.department || "",
      Year: member.year || "",
      "Student ID": member.studentId || "",
      "Team Head": norm(member.email) && norm(member.email) === headEmail ? "Yes" : "",
    }));
  }

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const book = XLSX.utils.book_new();
  const sheet = (rows) => { const ws = XLSX.utils.json_to_sheet(rows); ws["!cols"] = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.min(40, Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)) + 2) })); return ws; };
  XLSX.utils.book_append_sheet(book, sheet(teamRows), "Teams");
  XLSX.utils.book_append_sheet(book, sheet(memberRows), "Members");
  const xlsxFile = path.join(outDir, `dexathon-teams-${stamp}.xlsx`);
  const jsonFile = path.join(outDir, `dexathon-teams-${stamp}.json`);
  XLSX.writeFile(book, xlsxFile);
  fs.writeFileSync(jsonFile, JSON.stringify(teams, null, 1));
  const snapshot = `registrations_snapshot_${stamp}`;
  await db.collection(snapshot).insertMany(teams);

  console.log(`Teams in database: ${all.length} | saved: ${teams.length} | duplicate team records left out: ${dropped.length}${dropped.length ? ` (${dropped.map((t) => t.teamId).join(", ")})` : ""}`);
  console.log(`Member rows: ${memberRows.length} | repeated people merged inside teams: ${mergedMembers}`);
  console.log(`Excel: ${xlsxFile}\nJSON:  ${jsonFile}\nDatabase snapshot: ${snapshot}`);
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

// Brings the Google Form responses sheet's per-member colleges and "how did you know about this event" answers
// into the matching registrations (matched by Team Leader email), and reports cross-college teams.
//   node src/scripts/syncFromSheet.js "<sheet.xlsx>"           → preview, writes nothing
//   node src/scripts/syncFromSheet.js "<sheet.xlsx>" --apply   → back up, then update
// Only member colleges and the referral answer are written; names, phones and emails are not touched. Members are matched
// by name. A member's college changes only when it's empty or the sheet names a different college (spelling-only
// differences are left as they are), and placeholder answers such as "NA" are ignored.
import "dotenv/config";
import fs from "fs";
import mongoose from "mongoose";
import XLSX from "xlsx";
import { connectDB } from "../config/db.js";
import Registration from "../models/Registration.js";
import { createCollegeLookup } from "../services/collegeRegistry.js";
import { referralCategory } from "../services/referralSource.js";

const tidy = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const email = (v) => tidy(v).toLowerCase();
const nameKey = (v) => tidy(v).toLowerCase().replace(/[^a-z]/g, "");
const PLACEHOLDER = /^(n\/?a|nil|null|none|no|-+|\.+|same|same as above)$/i;
const col = (row, test) => { const key = Object.keys(row).find((k) => test(k.trim().toLowerCase())); return key ? row[key] : ""; };

// The form's member columns: "Member N - Full Name" followed by that member's college/year/phone columns, in order.
const sheetTeam = (row) => {
  const keys = Object.keys(row);
  const members = [];
  keys.forEach((key, i) => {
    const m = key.match(/^member\s*(\d+)\s*-\s*full name/i);
    if (!m || !tidy(row[key])) return;
    const next = keys.slice(i + 1, i + 4);
    members.push({ slot: Number(m[1]), name: tidy(row[key]), college: tidy(row[next.find((k) => /college/i.test(k))] ?? ""), year: tidy(row[next.find((k) => /year/i.test(k))] ?? "") });
  });
  return {
    teamName: tidy(col(row, (k) => k === "team name")),
    submittedAt: col(row, (k) => k === "timestamp"),
    leaderName: tidy(col(row, (k) => k === "team leader name")),
    leaderEmail: email(col(row, (k) => k === "team leader email")),
    leaderCollege: tidy(col(row, (k) => k === "college name")),
    referral: tidy(col(row, (k) => k.startsWith("from where you know"))),
    members,
  };
};

const run = async () => {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error('Usage: node src/scripts/syncFromSheet.js "<sheet.xlsx>" [--apply]');
  const rows = XLSX.utils.sheet_to_json((() => { const wb = XLSX.readFile(file, { cellDates: true }); return wb.Sheets["Form responses 1"] || wb.Sheets[wb.SheetNames[0]]; })(), { defval: "" }).map(sheetTeam).filter((t) => t.leaderEmail);
  // Later submissions win when a team submitted twice.
  const byEmail = new Map(rows.map((r) => [r.leaderEmail, r]));

  await connectDB();
  const lookup = await createCollegeLookup();
  const teams = await Registration.find({});
  await lookup.prepare([...rows.flatMap((r) => [r.leaderCollege, ...r.members.map((m) => m.college)]), ...teams.flatMap((t) => (t.members || []).map((m) => m.college))]);

  const report = { sheetTeams: byEmail.size, matched: 0, notInPortal: [], crossCollege: [], memberCollegeUpdates: 0, referralUpdates: 0, teamsChanged: 0 };
  const changes = [];
  for (const [leaderEmail, row] of byEmail) {
    // By Team Head email; by team name when the email was corrected in the portal after the form (e.g. a ".co" typo).
    const team = teams.find((t) => email(t.leader?.email) === leaderEmail)
      || teams.find((t) => tidy(t.teamName).toLowerCase() === row.teamName.toLowerCase() && !byEmail.has(email(t.leader?.email)));
    if (!team) { report.notInPortal.push(`${row.teamName} <${leaderEmail}>`); continue; }
    report.matched++;
    const sheetColleges = [row.leaderCollege, ...row.members.map((m) => m.college)].filter((c) => c && !PLACEHOLDER.test(c)).map((c) => lookup.forRaw(c));
    const distinct = [...new Map(sheetColleges.map((c) => [c.collegeId || c.name, c])).values()];
    if (distinct.length > 1) report.crossCollege.push({ teamId: team.teamId, teamName: team.teamName, colleges: distinct.map((c) => c.name) });

    const updates = [];
    for (const sm of row.members) {
      if (!sm.college || PLACEHOLDER.test(sm.college)) continue;
      const member = (team.members || []).find((m) => nameKey(m.name) === nameKey(sm.name));
      if (!member) continue;
      const before = lookup.forRaw(member.college), after = lookup.forRaw(sm.college);
      if (tidy(member.college) && (before.collegeId || before.name) === (after.collegeId || after.name)) continue;
      updates.push({ name: member.name, from: tidy(member.college), to: sm.college });
      member.college = sm.college;
    }
    const referralChanged = row.referral && tidy(team.referralSource?.raw) !== row.referral;
    if (referralChanged) team.referralSource = { raw: row.referral, category: referralCategory(row.referral), source: "sheet" };
    const submittedAt = row.submittedAt instanceof Date ? row.submittedAt : null;
    const timeChanged = submittedAt && team.formSubmittedAt?.getTime() !== submittedAt.getTime();
    if (timeChanged) team.formSubmittedAt = submittedAt;
    if (updates.length || referralChanged || timeChanged) {
      report.teamsChanged++; report.memberCollegeUpdates += updates.length; if (referralChanged) report.referralUpdates++;
      changes.push({ team, teamId: team.teamId, updates, referral: referralChanged ? row.referral : null });
    }
  }

  console.log(`Sheet teams: ${report.sheetTeams} | in portal: ${report.matched} | not in portal yet: ${report.notInPortal.length}`);
  console.log(`Cross-college teams (members from more than one college): ${report.crossCollege.length}`);
  for (const c of report.crossCollege) console.log(`  ${c.teamId} ${c.teamName}: ${c.colleges.join("  +  ")}`);
  console.log(`\nWould update: ${report.memberCollegeUpdates} member college(s) and ${report.referralUpdates} "how did you know" answer(s) on ${report.teamsChanged} team(s), plus form submission times.`);
  for (const ch of changes.filter((c) => c.updates.length).slice(0, 60)) console.log(`  ${ch.teamId}: ${ch.updates.map((u) => `${u.name}: "${u.from || "—"}" → "${u.to}"`).join("; ")}`);
  if (report.notInPortal.length) console.log(`\nIn the sheet but not in the portal (import them from Team Lists): ${report.notInPortal.join(", ")}`);

  if (!apply) { console.log("\nPreview only. Run again with --apply to update."); return; }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.mkdirSync("backups", { recursive: true });
  fs.writeFileSync(`backups/registrations-before-sheet-sync-${stamp}.json`, JSON.stringify(teams.map((t) => t.toObject()), null, 1));
  for (const ch of changes) { ch.team.markModified("members"); await ch.team.save(); }
  console.log(`\nUpdated ${changes.length} team(s). Backup: backups/registrations-before-sheet-sync-${stamp}.json`);
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

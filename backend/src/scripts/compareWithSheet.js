// Compares the teams in the database with a Google Form responses spreadsheet. Read-only.
//   node src/scripts/compareWithSheet.js "<path to .xlsx>"
// A database team counts as "in the sheet" when a sheet row has the same Team Leader email, a near-identical
// email (1–2 character typo), the same team name, or the same Team Leader phone.
import "dotenv/config";
import mongoose from "mongoose";
import XLSX from "xlsx";
import { connectDB } from "../config/db.js";

const email = (v) => String(v || "").trim().toLowerCase();
const name = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const phone = (v) => String(v || "").replace(/\D/g, "").slice(-10);
const editDistance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return row[b.length];
};
const col = (row, label) => { const key = Object.keys(row).find((k) => k.trim().toLowerCase() === label.toLowerCase()); return key ? row[key] : ""; };

const run = async () => {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node src/scripts/compareWithSheet.js "<path to .xlsx>"');
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" })
    .map((row, i) => ({ line: i + 2, team: col(row, "Team Name"), email: email(col(row, "Team Leader Email")), phone: phone(col(row, "Team Leader Phone Number")), leader: col(row, "Team Leader Name") }))
    .filter((r) => r.team || r.email);

  await connectDB();
  const teams = await mongoose.connection.db.collection("registrations").find({}).toArray();
  teams.sort((a, b) => String(a.teamId).localeCompare(String(b.teamId), undefined, { numeric: true }));

  const matchOf = (t) => {
    const e = email(t.leader?.email), n = name(t.teamName), p = phone(t.leader?.phone);
    return rows.find((r) => e && r.email === e) && "email"
      || rows.find((r) => e && r.email && editDistance(r.email, e) <= 2) && "near-identical email"
      || rows.find((r) => n && name(r.team) === n) && "team name"
      || rows.find((r) => p.length === 10 && r.phone === p) && "leader phone"
      || null;
  };

  const missing = teams.filter((t) => !matchOf(t));
  const fuzzy = teams.map((t) => [t, matchOf(t)]).filter(([, how]) => how && how !== "email");
  console.log(`Sheet rows: ${rows.length} | database teams: ${teams.length} | in the database but NOT in the sheet: ${missing.length}`);
  for (const t of missing) {
    console.log(`\n${t.teamId} | ${t.teamName} | registered ${t.createdAt ? new Date(new Date(t.createdAt).getTime() + 5.5 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + " IST" : "?"} | source ${t.importSource || "-"}`);
    console.log(`  Team Head: ${t.leader?.name || "-"} <${t.leader?.email || "-"}> ${t.leader?.phone || ""}`);
    console.log(`  College: ${t.college || t.collegeName || "-"} | Dept/Year: ${t.department || "-"} / ${t.year || "-"} | Theme: ${t.projectTheme || "-"}`);
    console.log(`  Members (${(t.members || []).length}): ${(t.members || []).map((m) => `${m.name}${m.phone ? ` (${m.phone})` : ""}`).join(", ") || "none"}`);
    console.log(`  Payment: ${t.payment?.status || "-"}${t.payment?.transactionId ? ` (txn ${t.payment.transactionId})` : ""} | Registration email: ${t.registrationEmail?.status || "Not Sent"}`);
  }
  if (fuzzy.length) {
    console.log(`\nMatched only by a fallback (worth a look): `);
    for (const [t, how] of fuzzy) console.log(`  ${t.teamId} ${t.teamName} <${t.leader?.email}> — by ${how}`);
  }
  const inSheetOnly = rows.filter((r) => !teams.some((t) => email(t.leader?.email) === r.email || (r.email && editDistance(email(t.leader?.email), r.email) <= 2) || name(t.teamName) === name(r.team)));
  console.log(`\nSheet rows with no team in the database: ${inSheetOnly.length}`);
  for (const r of inSheetOnly) console.log(`  row ${r.line}: ${r.team} | ${r.leader} <${r.email}>`);
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

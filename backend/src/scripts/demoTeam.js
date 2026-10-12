// Demo team for trying the Team Login Portal.
//   node src/scripts/demoTeam.js create   → adds the demo team (if missing)
//   node src/scripts/demoTeam.js delete   → removes it again
// Uses a non-sequential Team ID so no real DEX26xxx number is consumed, and an
// example.com email (reserved, never delivered) so no real person is emailed.
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Registration from "../models/Registration.js";

const DEMO = {
  teamId: "DEMO2026",
  registrationNumber: "REG-DEMO",
  teamName: "DEMO TEAM",
  teamSize: 5,
  projectTheme: "OPEN INNOVATION",
  college: "Demo College",
  collegeName: "Demo College",
  collegeType: "other",
  department: "CSE",
  year: "III",
  leader: { name: "Demo Team Head", email: "demo.team@example.com", phone: "9000000000" },
  members: [
    { name: "Demo Member One", email: "demo.member1@example.com", phone: "9000000001", college: "Demo College", department: "CSE", year: "III", studentId: "DEMO001" },
    { name: "Demo Member Two", email: "demo.member2@example.com", phone: "9000000002", college: "Demo College", department: "ECE", year: "III", studentId: "DEMO002" },
    { name: "Demo Member Three", email: "demo.member3@example.com", phone: "9000000003", college: "Demo College", department: "IT", year: "II", studentId: "DEMO003" },
    { name: "Demo Member Four", email: "demo.member4@example.com", phone: "9000000004", college: "Demo College", department: "EEE", year: "II", studentId: "DEMO004" },
  ],
  importSource: "DEMO",
};

const run = async () => {
  const mode = process.argv[2];
  if (!["create", "delete"].includes(mode)) throw new Error("Usage: node src/scripts/demoTeam.js create|delete");
  await connectDB();

  if (mode === "create") {
    const existing = await Registration.findOne({ teamId: DEMO.teamId });
    if (existing) console.log(`Demo team already exists (${existing.teamId}).`);
    else { await Registration.create(DEMO); console.log(`Demo team created (${DEMO.teamId}).`); }
    console.log(`Login: ${DEMO.leader.email}  Password (Team ID): ${DEMO.teamId}`);
  } else {
    const result = await Registration.deleteOne({ teamId: DEMO.teamId, importSource: "DEMO" });
    console.log(result.deletedCount ? "Demo team deleted." : "No demo team found.");
  }
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

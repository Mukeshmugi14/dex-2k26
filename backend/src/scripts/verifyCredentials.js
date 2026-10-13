// Checks Team Login credentials exactly as the portal does (Team Head email + Team ID).
//   node src/scripts/verifyCredentials.js <credentials.json>
// The JSON file is a list of [email, teamId] pairs. Read-only.
import "dotenv/config";
import fs from "fs";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Registration from "../models/Registration.js";
import { findTeamByLeaderCredentials } from "../services/teamIdService.js";

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const run = async () => {
  const creds = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  await connectDB();
  const failed = [];
  for (const [email, teamId] of creds) {
    const team = await findTeamByLeaderCredentials(email, teamId);
    if (team) { console.log(`OK    ${teamId} ${email} -> ${team.teamName} | email ${team.registrationEmail?.status}`); continue; }
    const byId = await Registration.findOne({ teamId }, "teamId teamName leader.email").lean();
    const byEmail = await Registration.findOne({ "leader.email": { $regex: `^\\s*${escapeRegex(email)}\\s*$`, $options: "i" } }, "teamId teamName").lean();
    console.log(`FAIL  ${teamId} ${email} | Team ID in DB: ${byId ? `${byId.teamName} <${byId.leader?.email}>` : "no"} | email in DB: ${byEmail ? byEmail.teamId : "no"}`);
    failed.push([email, teamId]);
  }
  console.log(`\n${creds.length - failed.length} of ${creds.length} credentials work.`);
  if (failed.length) console.log(`FAILED: ${JSON.stringify(failed)}`);
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

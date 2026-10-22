// Round 1 deadline reminder to every team's Team Head email (teams that already submitted get the "received" version).
//   node src/scripts/sendRound1Reminders.js --preview <dir>   → writes both versions (sample team) and the recipient counts; sends nothing
//   node src/scripts/sendRound1Reminders.js --send            → sends to every team not yet reminded, one at a time
// Each team's result is stored in round1Reminder, so re-running only retries teams that weren't sent.
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Registration from "../models/Registration.js";
import { previewRound1ReminderEmail, sendRound1ReminderEmail } from "../services/emailService.js";
import { round1Open } from "../services/submissionService.js";

const GAP_MS = 2500; // stay well under Gmail's sending rate
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const args = process.argv.slice(2);

const run = async () => {
  await connectDB();
  const teams = await Registration.find({ teamId: { $exists: true, $ne: null }, "leader.email": { $exists: true, $ne: "" } }, "teamId teamName leader pdfSubmission.fileId pdfSubmission.fileName pdfSubmission.submittedAt round1Reminder").sort({ teamId: 1 }).lean();
  const pending = teams.filter((t) => t.round1Reminder?.status !== "Sent");
  const submitted = pending.filter((t) => t.pdfSubmission?.fileId).length;
  console.log(`Teams: ${teams.length} | already reminded: ${teams.length - pending.length} | to send: ${pending.length} (${pending.length - submitted} not submitted, ${submitted} submitted)`);

  if (args[0] === "--preview") {
    const dir = args[1] || ".";
    fs.mkdirSync(dir, { recursive: true });
    const sample = { teamId: "DEX26000", teamName: "Sample Team", leader: { name: "Sample Team Head", email: "team.head@example.com" } };
    for (const [name, team] of [["not-submitted", sample], ["submitted", { ...sample, pdfSubmission: { fileId: "x", fileName: "Sample-Team-Round1.pdf", submittedAt: new Date() } }]]) {
      const mail = previewRound1ReminderEmail(team);
      fs.writeFileSync(path.join(dir, `round1-reminder-${name}.html`), mail.html);
      console.log(`${name}: "${mail.subject}" → ${path.join(dir, `round1-reminder-${name}.html`)}`);
    }
    return;
  }
  if (args[0] !== "--send") throw new Error("Use --preview <dir> or --send.");
  if (!round1Open()) throw new Error("Round 1 submission has already closed; not sending a deadline reminder.");

  let sent = 0, failed = 0;
  for (const [i, team] of pending.entries()) {
    const variant = team.pdfSubmission?.fileId ? "submitted" : "not-submitted";
    // Claim the team first so two runs can never email it twice.
    const claimed = await Registration.updateOne({ _id: team._id, "round1Reminder.status": { $ne: "Sent" } }, { $set: { "round1Reminder.status": "Sending", "round1Reminder.attemptAt": new Date() } });
    if (!claimed.modifiedCount) continue;
    try {
      const { messageId } = await sendRound1ReminderEmail(team);
      await Registration.updateOne({ _id: team._id }, { $set: { "round1Reminder.status": "Sent", "round1Reminder.sentAt": new Date(), "round1Reminder.messageId": messageId || "", "round1Reminder.variant": variant, "round1Reminder.error": null } });
      sent++;
    } catch (error) {
      await Registration.updateOne({ _id: team._id }, { $set: { "round1Reminder.status": "Failed", "round1Reminder.error": String(error.code || error.message).slice(0, 200) } });
      failed++;
      console.log(`  FAILED ${team.teamId}: ${error.code || error.message}`);
    }
    if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${pending.length} (sent ${sent}, failed ${failed})`);
    await sleep(GAP_MS);
  }
  console.log(`Done. Sent ${sent}, failed ${failed}.${failed ? " Run --send again to retry the failed ones." : ""}`);
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

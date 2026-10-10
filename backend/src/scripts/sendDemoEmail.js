import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { sendWithSmtp, verifySmtp } from "../services/smtpTransport.js";
import { buildTeamConfirmationEmail, POSTER_CID, POSTER_IMAGE_PATH } from "../templates/paymentConfirmationEmail.js";

async function main() {
  const recipient = "dexathon2k26@gmail.com";
  console.log(`Verifying SMTP connection...`);
  await verifySmtp();
  console.log(`SMTP connection verified successfully.`);

  await mongoose.connect(process.env.MONGO_URI);
  const team1 = await mongoose.connection.collection("registrations").findOne({ teamId: "DEX26001" });
  console.log(`Found Team 1 in DB:`, team1?.teamName, team1?.teamId);

  const demoRegistration = {
    ...team1,
    leader: {
      name: "DEXATHON Admin / Team Lead",
      email: recipient,
      phone: "+91 98765 43210"
    },
    teamName: team1?.teamName || "Elite.html",
    teamId: "DEX26001",
    registrationNumber: "REG-001",
    college: "Sathyabama Institute of Science and Technology",
    projectTheme: team1?.projectTheme || "AI & MACHINE LEARNING",
  };

  const portal = {
    teamId: "DEX26001",
    teamName: demoRegistration.teamName,
    email: recipient,
    password: "Dexathon@2026",
    loginUrl: "http://localhost:5173/team-login",
  };

  console.log(`Building official team confirmation email with portal access...`);
  const { html, text } = buildTeamConfirmationEmail(demoRegistration, { portal });

  const mailOptions = {
    to: recipient,
    subject: "DEXATHON 2026 — Team Login Portal Access Demo ✓",
    html,
    text,
    attachments: [
      {
        filename: "dexathon-2026-poster.jpg",
        path: POSTER_IMAGE_PATH,
        cid: POSTER_CID
      }
    ]
  };

  console.log(`Sending demo email to ${recipient}...`);
  const result = await sendWithSmtp(mailOptions);
  console.log(`✅ Demo email sent successfully! MessageId: ${result.messageId}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("❌ Failed to send demo email:", err);
  process.exit(1);
});

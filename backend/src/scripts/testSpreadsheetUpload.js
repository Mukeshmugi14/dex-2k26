import "dotenv/config";
import * as XLSX from "xlsx";
import mongoose from "mongoose";
import { processSpreadsheetImport } from "../services/spreadsheetImportService.js";

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const Registration = (await import("../models/Registration.js")).default;

  const initialCount = await Registration.countDocuments();
  console.log(`Initial total teams in DB: ${initialCount}`);

  // Construct a test workbook
  const testRows = [
    {
      "Team Name": "Elite.html", // Existing team (Team 1) -> must be left free
      "Leader Name": "Aswin AS Jaenif",
      "Email Address": "aswinjaenif@gmail.com",
      "Phone Number": "9999999999",
      "College Name": "Sathyabama Institute of Science and Technology",
      "Project Theme": "AI & MACHINE LEARNING",
      "Member 2 Name": "Alice",
      "Member 3 Name": "Bob",
    },
    {
      "Team Name": "Raw Matrix", // Existing team (Team 2) -> must be left free
      "Leader Name": "Kallathur Rishitha Reddy",
      "Email Address": "rishitha2006@gmail.com",
      "Phone Number": "9888888888",
      "College Name": "Sathyabama Institute of Science and Technology",
      "Project Theme": "OPEN INNOVATION",
    },
    {
      "Team Name": "Cyber Guardians", // Brand new team 1 -> must be formed as DEX26011
      "Leader Name": "Vikas Sharma",
      "Email Address": "cyberguardians@test.com",
      "Phone Number": "9777777777",
      "College Name": "Sathyabama Institute of Science and Technology",
      "Project Theme": "BLOCKCHAIN & CYBERSECURITY",
      "Member 2 Name": "Member Two",
      "Member 3 Name": "Member Three",
    },
    {
      "Team Name": "Cyber Guardians", // Duplicate row in sheet -> must be skipped
      "Leader Name": "Vikas Sharma",
      "Email Address": "cyberguardians@test.com",
      "Phone Number": "9777777777",
      "College Name": "Sathyabama Institute of Science and Technology",
      "Project Theme": "BLOCKCHAIN & CYBERSECURITY",
    },
    {
      "Team Name": "Quantum Leap", // Brand new team 2 -> must be formed as DEX26012
      "Leader Name": "Pooja Nair",
      "Email Address": "quantumleap@test.com",
      "Phone Number": "9666666666",
      "College Name": "Sathyabama Institute of Science and Technology",
      "Project Theme": "HEALTHCARE",
      "Member 2 Name": "Rohan",
      "Member 3 Name": "Sneha",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(testRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Teams");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  console.log("Running processSpreadsheetImport with test spreadsheet buffer...");
  const result = await processSpreadsheetImport(buffer);

  console.log("Import summary result:", result.summary);

  // Verifications
  if (result.summary.importedCount === 2) {
    console.log("✅ [PASS] Exactly 2 new teams imported.");
  } else {
    console.error(`❌ [FAIL] Expected 2 new teams, got ${result.summary.importedCount}`);
  }

  if (result.summary.skippedCount === 2) {
    console.log("✅ [PASS] Exactly 2 existing teams left untouched without duplication.");
  } else {
    console.error(`❌ [FAIL] Expected 2 skipped teams, got ${result.summary.skippedCount}`);
  }

  if (result.summary.duplicateCount === 1) {
    console.log("✅ [PASS] Exactly 1 duplicate row in file skipped.");
  } else {
    console.error(`❌ [FAIL] Expected 1 duplicate skipped, got ${result.summary.duplicateCount}`);
  }

  // Check the newly created teams in DB
  const cyber = await Registration.findOne({ "leader.email": "cyberguardians@test.com" });
  const quantum = await Registration.findOne({ "leader.email": "quantumleap@test.com" });

  console.log("New team 1 in DB:", cyber?.teamId, cyber?.teamName, cyber?.registrationNumber);
  console.log("New team 2 in DB:", quantum?.teamId, quantum?.teamName, quantum?.registrationNumber);

  if (cyber?.teamId === "DEX26011" && quantum?.teamId === "DEX26012") {
    console.log("✅ [PASS] Sequential IDs DEX26011 and DEX26012 correctly assigned.");
  } else {
    console.error(`❌ [FAIL] Sequential IDs incorrect: ${cyber?.teamId}, ${quantum?.teamId}`);
  }

  // Clean up test teams so DB stays with original 10 teams
  await Registration.deleteMany({
    "leader.email": { $in: ["cyberguardians@test.com", "quantumleap@test.com"] }
  });
  console.log("Cleaned up test teams. Current total in DB:", await Registration.countDocuments());

  await mongoose.disconnect();
}

run().catch(console.error);

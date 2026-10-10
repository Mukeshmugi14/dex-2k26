import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

const TARGET_LEADERS = [
  { num: 1, email: "aswinjaenif@gmail.com", teamName: "Elite.html", leaderName: "Aswin AS Jaenif" },
  { num: 2, email: "rishitha2006@gmail.com", teamName: "Raw Matrix", leaderName: "Kallathur Rishitha Reddy" },
  { num: 3, email: "dasthudasthu177@gmail.com", teamName: "Neural nomad", leaderName: "A Dhasthageer" },
  { num: 4, email: "bavadharani1901@gmail.com", teamName: "Idea flux", leaderName: "Bavadharani S" },
  { num: 5, email: "kamaliseetharaman848@gmail.com", teamName: "Team Kamali", leaderName: "Kamali Seetharaman" },
  { num: 6, email: "ma2230@srmist.edu.in", teamName: "AgentVerse", leaderName: "Mohammed Faizan Ansari" },
  { num: 7, email: "xsanjayofficial@gmail.com", teamName: "Bug Buster", leaderName: "M A SANJAY RAJ" },
  { num: 8, email: "shivanimurthi@gmail.com", altEmail: "shivanimurthi09@gmail.com", teamName: "Nexovara", leaderName: "Shivani.M" },
  { num: 9, email: "sanjay.cric07@gmail.com", teamName: "HACK MATES", leaderName: "Sanjay Adithiya A K" },
  { num: 10, email: "7504.ahamedabdullah@gmail.com", teamName: "Team Ahamed Abdullah", leaderName: "Ahamed Abdullah" },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.collection("registrations");

  // 1. Backup all current 18 teams
  const allCurrent = await collection.find({}).toArray();
  console.log(`Current total registrations in DB: ${allCurrent.length}`);
  const backupPath = path.join(process.cwd(), "backend/src/scripts/registrations_backup.json");
  fs.writeFileSync(backupPath, JSON.stringify(allCurrent, null, 2));
  console.log(`Saved JSON backup to ${backupPath}`);

  // Backup in MongoDB collection as well
  const backupCol = mongoose.connection.collection("registrations_backup");
  await backupCol.deleteMany({});
  if (allCurrent.length > 0) {
    await backupCol.insertMany(allCurrent);
    console.log(`Saved ${allCurrent.length} documents to MongoDB 'registrations_backup' collection.`);
  }

  // 2. Identify which documents to keep and which to remove
  const targetEmailSet = new Set(
    TARGET_LEADERS.flatMap(t => [t.email.toLowerCase(), (t.altEmail || "").toLowerCase()].filter(Boolean))
  );

  const matchedDocsByTarget = []; // index 0..9 corresponding to TARGET_LEADERS
  const toDeleteIds = [];
  const seenLeaderEmails = new Set();

  for (let i = 0; i < TARGET_LEADERS.length; i++) {
    const target = TARGET_LEADERS[i];
    const emailsToMatch = [target.email.toLowerCase(), (target.altEmail || "").toLowerCase()].filter(Boolean);

    // Find in current docs
    const matches = allCurrent.filter(doc => {
      const docEmail = (doc.leader?.email || "").trim().toLowerCase();
      return emailsToMatch.includes(docEmail);
    });

    if (matches.length > 0) {
      // Pick the first one as primary
      const primary = matches[0];
      matchedDocsByTarget[i] = primary;
      seenLeaderEmails.add((primary.leader?.email || "").trim().toLowerCase());

      // If duplicate records exist for this leader (e.g. sanjay.cric07@gmail.com), mark others for deletion
      for (let k = 1; k < matches.length; k++) {
        console.log(`Found duplicate for ${target.email}: ${matches[k]._id}. Marking for deletion.`);
        toDeleteIds.push(matches[k]._id);
      }
    } else {
      matchedDocsByTarget[i] = null; // Needs creation
    }
  }

  // Find all other docs that are NOT in target list
  for (const doc of allCurrent) {
    const docEmail = (doc.leader?.email || "").trim().toLowerCase();
    if (!targetEmailSet.has(docEmail)) {
      console.log(`Removing non-target team: ${doc.teamName} (${docEmail}) [ID: ${doc._id}]`);
      toDeleteIds.push(doc._id);
    }
  }

  // 3. Delete non-target teams and duplicates
  if (toDeleteIds.length > 0) {
    const delResult = await collection.deleteMany({ _id: { $in: toDeleteIds } });
    console.log(`Deleted ${delResult.deletedCount} non-target/duplicate registrations.`);
  }

  // 4. Temporary prefix remaining documents to avoid unique key collision during re-indexing
  for (const doc of allCurrent) {
    if (!toDeleteIds.some(id => id.toString() === doc._id.toString())) {
      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            teamId: `TMP-${doc._id.toString().slice(-6)}`,
            registrationNumber: `TMP-${doc._id.toString().slice(-6)}`,
          }
        }
      );
    }
  }

  // 5. Update or insert the 10 teams in exact order
  for (let i = 0; i < TARGET_LEADERS.length; i++) {
    const target = TARGET_LEADERS[i];
    const num = target.num;
    const padded = String(num).padStart(3, "0");
    const assignedTeamId = `DEX26${padded}`;
    const assignedRegNum = `REG-${padded}`;
    const existingDoc = matchedDocsByTarget[i];

    if (existingDoc) {
      // Update existing document
      await collection.updateOne(
        { _id: existingDoc._id },
        {
          $set: {
            teamId: assignedTeamId,
            registrationNumber: assignedRegNum,
            "leader.email": target.email, // Ensure email matches canonical list
          }
        }
      );
      console.log(`[Team ${num}] Updated ${existingDoc.teamName} -> ${assignedTeamId} | ${target.email}`);
    } else {
      // Create new team document
      const newDoc = {
        teamId: assignedTeamId,
        registrationNumber: assignedRegNum,
        teamName: target.teamName,
        projectTheme: "OPEN INNOVATION",
        college: "Sathyabama Institute of Science and Technology",
        collegeType: "sathyabama",
        collegeName: "Sathyabama Institute of Science and Technology",
        department: "Computer Applications",
        year: "3",
        leader: {
          name: target.leaderName,
          email: target.email,
          phone: "",
        },
        members: [
          { name: target.leaderName, email: target.email, phone: "", studentId: "" },
        ],
        mentor: { name: "", email: "", phone: "" },
        rounds: {
          round1: "PENDING",
          round2: "UPCOMING",
          round3: "UPCOMING",
          scoreReleased: false,
        },
        importSource: "MANUAL",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertRes = await collection.insertOne(newDoc);
      console.log(`[Team ${num}] Created ${target.teamName} -> ${assignedTeamId} | ${target.email} (_id: ${insertRes.insertedId})`);
    }
  }

  // 6. Verify final collection
  const finalTeams = await collection.find({}).sort({ teamId: 1 }).toArray();
  console.log(`\nFinal total teams in database: ${finalTeams.length}`);
  finalTeams.forEach((t, idx) => {
    console.log(`${idx + 1}. [${t.teamId}] ${t.teamName} - Leader: ${t.leader?.name} <${t.leader?.email}> (Reg: ${t.registrationNumber})`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);

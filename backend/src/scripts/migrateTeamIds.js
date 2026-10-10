import "dotenv/config";
import mongoose from "mongoose";

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  const teams = await mongoose.connection.collection("registrations")
    .find({})
    .sort({ createdAt: 1 })
    .toArray();

  console.log(`Migrating ${teams.length} teams to sequential DEX26 IDs...`);
  for (let i = 0; i < teams.length; i++) {
    const seq = i + 1;
    const padded = String(seq).padStart(3, "0");
    const newTeamId = `DEX26${padded}`;
    const newRegNum = `REG-${padded}`;
    await mongoose.connection.collection("registrations").updateOne(
      { _id: teams[i]._id },
      { $set: { teamId: newTeamId, registrationNumber: newRegNum } }
    );
    console.log(`${seq}. ${teams[i].teamName} -> Team ID: ${newTeamId} (${newRegNum})`);
  }

  console.log("Migration finished successfully!");
  await mongoose.disconnect();
}

migrate().catch(console.error);

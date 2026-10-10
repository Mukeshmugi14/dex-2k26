import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.collection("registrations").updateOne(
    { teamName: "Star Wars" },
    { $set: { teamId: "DEX26011", registrationNumber: "REG-011" } }
  );
  const team = await mongoose.connection.collection("registrations").findOne({ teamName: "Star Wars" });
  console.log("Updated team:", team.teamId, team.teamName, team.registrationNumber);
  await mongoose.disconnect();
}

main().catch(console.error);

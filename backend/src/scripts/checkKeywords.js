import "dotenv/config";
import mongoose from "mongoose";

async function checkAll() {
  await mongoose.connect(process.env.MONGO_URI);
  const teams = await mongoose.connection.collection("registrations").find({}).toArray();
  console.log(`Checking ${teams.length} teams...`);

  for (const t of teams) {
    const json = JSON.stringify(t);
    if (/kamali/i.test(json)) console.log("Matched 'kamali' in:", t.teamName, t._id);
    if (/seetharaman/i.test(json)) console.log("Matched 'seetharaman' in:", t.teamName, t._id);
    if (/ahamed/i.test(json)) console.log("Matched 'ahamed' in:", t.teamName, t._id);
    if (/abdullah/i.test(json)) console.log("Matched 'abdullah' in:", t.teamName, t._id);
    if (/7504/i.test(json)) console.log("Matched '7504' in:", t.teamName, t._id);
    if (/shivani/i.test(json)) console.log("Matched 'shivani' in:", t.teamName, t.leader?.email);
  }

  await mongoose.disconnect();
}

checkAll().catch(console.error);

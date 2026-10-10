import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log("Collections:", collections.map(c => c.name));

  const searchEmails = [
    "aswinjaenif@gmail.com",
    "rishitha2006@gmail.com",
    "dasthudasthu177@gmail.com",
    "bavadharani1901@gmail.com",
    "kamaliseetharaman848@gmail.com",
    "ma2230@srmist.edu.in",
    "xsanjayofficial@gmail.com",
    "shivanimurthi@gmail.com",
    "shivanimurthi09@gmail.com",
    "sanjay.cric07@gmail.com",
    "7504.ahamedabdullah@gmail.com"
  ];

  for (const c of collections) {
    const col = mongoose.connection.collection(c.name);
    for (const em of searchEmails) {
      const docs = await col.find({
        $or: [
          { "leader.email": { $regex: em, $options: "i" } },
          { "members.email": { $regex: em, $options: "i" } },
          { "mentor.email": { $regex: em, $options: "i" } },
          { email: { $regex: em, $options: "i" } }
        ]
      }).toArray();
      if (docs.length > 0) {
        console.log(`[${c.name}] Found ${docs.length} for ${em}:`);
        docs.forEach(d => console.log(`   id: ${d._id}, teamName: ${d.teamName}, leader: ${d.leader?.name} <${d.leader?.email}>`));
      }
    }
  }

  // Also check if any spreadsheets, csv, or json files exist in workspace
  await mongoose.disconnect();
}

main().catch(console.error);

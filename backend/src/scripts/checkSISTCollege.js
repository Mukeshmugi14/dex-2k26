import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const count = await mongoose.connection.collection("SISTCollege").countDocuments();
  console.log("SISTCollege count:", count);
  const docs = await mongoose.connection.collection("SISTCollege").find({}).toArray();
  for (const d of docs) {
    const s = JSON.stringify(d);
    if (/kamali/i.test(s) || /ahamed/i.test(s) || /7504/i.test(s) || /seetharaman/i.test(s)) {
      console.log("Found in SISTCollege:", d);
    }
  }
  await mongoose.disconnect();
}

main().catch(console.error);

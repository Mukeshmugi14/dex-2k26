// Finds registrations in the oplog by Team Head email or Team ID, with their later updates and deletion.
//   node src/scripts/findInOplog.js <credentials.json>      (list of [email, teamId] pairs). Read-only.
import "dotenv/config";
import fs from "fs";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";

const ist = (d) => `${new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(5, 19).replace("T", " ")} IST`;

const run = async () => {
  const creds = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  await connectDB();
  const oplog = mongoose.connection.client.db("local").collection("oplog.rs");
  const emails = creds.map(([email]) => email.toLowerCase());
  const ids = creds.map(([, id]) => id);

  // Inserts may be plain entries or inside transactions (applyOps).
  const plain = await oplog.find({ ns: "SIST.registrations", op: "i", $or: [{ "o.leader.email": { $in: emails } }, { "o.teamId": { $in: ids } }] }).toArray();
  const txs = await oplog.find({ op: "c", "o.applyOps": { $elemMatch: { ns: "SIST.registrations", op: "i", $or: [{ "o.leader.email": { $in: emails } }, { "o.teamId": { $in: ids } }] } } }).toArray();
  const inserts = [...plain.map((e) => ({ wall: e.wall, o: e.o })), ...txs.flatMap((t) => t.o.applyOps.filter((x) => x.ns === "SIST.registrations" && x.op === "i").map((x) => ({ wall: t.wall, o: x.o })))]
    .filter((e) => emails.includes(String(e.o.leader?.email || "").trim().toLowerCase()) || ids.includes(e.o.teamId));
  // Team IDs may also have been assigned later by an update.
  const idUpdates = await oplog.find({ ns: "SIST.registrations", op: "u", $or: [{ "o.diff.u.teamId": { $in: ids } }, { "o.$set.teamId": { $in: ids } }] }).toArray();

  for (const e of inserts) console.log(`${ist(e.wall)} INSERTED _id ${e.o._id} | ${e.o.teamId} | ${e.o.teamName} | ${e.o.leader?.email} | source ${e.o.importSource} | members ${(e.o.members || []).length}`);
  for (const u of idUpdates) console.log(`${ist(u.wall)} TEAM ID SET on _id ${u.o2._id} -> ${u.o.diff?.u?.teamId || u.o.$set?.teamId}`);

  const docIds = [...new Set([...inserts.map((e) => String(e.o._id)), ...idUpdates.map((u) => String(u.o2._id))])];
  for (const id of docIds) {
    const oid = new mongoose.Types.ObjectId(id);
    const del = await oplog.find({ ns: "SIST.registrations", op: "d", "o._id": oid }).toArray();
    const delTx = await oplog.find({ op: "c", "o.applyOps": { $elemMatch: { ns: "SIST.registrations", op: "d", "o._id": oid } } }).toArray();
    const ups = await oplog.countDocuments({ ns: "SIST.registrations", op: "u", "o2._id": oid });
    console.log(`_id ${id}: ${ups} update(s); deleted ${[...del, ...delTx].map((d) => ist(d.wall)).join(", ") || "never"}`);
  }
  if (!inserts.length && !idUpdates.length) console.log("Not found in the oplog.");
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

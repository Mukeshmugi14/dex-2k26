// Restores deleted registrations straight from the oplog: the original insert plus every later update.
//   node src/scripts/restoreFromOplog.js <_id>[,<_id>...] [--skip-session <lsidPrefix>]... [--apply]
// Preview only unless --apply. Skips a team whose _id, Team ID, registration number or Team Head email is
// already present. Sends no emails.
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { applyUpdate } from "./replayOplogUpdates.js";

const run = async () => {
  const args = process.argv.slice(2);
  const ids = (args[0] || "").split(",").filter(Boolean).map((id) => new mongoose.Types.ObjectId(id));
  const apply = args.includes("--apply");
  const skip = args.flatMap((a, i) => (a === "--skip-session" ? [args[i + 1]] : []));
  if (!ids.length) throw new Error("Usage: node src/scripts/restoreFromOplog.js <_id>[,<_id>...] [--skip-session <prefix>] [--apply]");

  await connectDB();
  const live = mongoose.connection.db.collection("registrations");
  const oplog = mongoose.connection.client.db("local").collection("oplog.rs");
  let restored = 0;

  for (const _id of ids) {
    let insert = (await oplog.findOne({ ns: "SIST.registrations", op: "i", "o._id": _id }))?.o;
    if (!insert) {
      const tx = await oplog.findOne({ op: "c", "o.applyOps": { $elemMatch: { ns: "SIST.registrations", op: "i", "o._id": _id } } });
      insert = tx?.o.applyOps.find((x) => x.op === "i" && String(x.o._id) === String(_id))?.o;
    }
    if (!insert) { console.log(`NOT FOUND ${_id}`); continue; }
    const doc = structuredClone(insert);
    let applied = 0, skipped = 0;
    for (const entry of await oplog.find({ ns: "SIST.registrations", op: "u", "o2._id": _id }).sort({ $natural: 1 }).toArray()) {
      if (skip.some((prefix) => String(entry.lsid?.id || "").startsWith(prefix))) { skipped++; continue; }
      if (applyUpdate(doc, entry.o)) applied++;
    }
    const clash = await live.findOne({ $or: [{ _id }, { teamId: doc.teamId }, { registrationNumber: doc.registrationNumber }, { "leader.email": doc.leader?.email }] }, { projection: { teamId: 1 } });
    const label = `${doc.teamId} ${doc.teamName} | ${doc.leader?.email} | ${(doc.members || []).length} members | theme ${doc.projectTheme || "-"} | email ${doc.registrationEmail?.status} | ${applied} update(s)${skipped ? `, ${skipped} skipped` : ""}`;
    if (clash) { console.log(`SKIP ${label} (present as ${clash.teamId})`); continue; }
    if (apply) await live.insertOne(doc);
    restored++;
    console.log(`${apply ? "RESTORED" : "WOULD RESTORE"} ${label}`);
  }
  console.log(`\n${apply ? "Restored" : "Would restore"} ${restored} team(s).${apply ? "" : " Preview only; add --apply to write."}`);
};

run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

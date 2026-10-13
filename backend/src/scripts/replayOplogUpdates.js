// Replays oplog updates onto restored registrations, to recover changes made after a backup.
//   node src/scripts/replayOplogUpdates.js <fromISO> <toISO> [--skip-session <lsidPrefix>]... [--apply]
// Preview only unless --apply. Only touches registrations that exist now; each team's updates are
// applied in oplog order using MongoDB's update-diff format ($v: 2), then the document is replaced.
import "dotenv/config";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { connectDB } from "../config/db.js";

// Applies one MongoDB $v:2 update diff to a plain object.
const applyDiff = (target, diff) => {
  for (const key of Object.keys(diff.d || {})) delete target[key];
  Object.assign(target, diff.u || {}, diff.i || {});
  for (const [key, sub] of Object.entries(diff)) {
    if (!key.startsWith("s") || typeof sub !== "object") continue;
    const field = key.slice(1);
    if (sub.a === true) {
      const array = Array.isArray(target[field]) ? target[field] : (target[field] = []);
      if (typeof sub.l === "number") array.length = sub.l;
      for (const [k, value] of Object.entries(sub)) {
        if (/^u\d+$/.test(k)) array[Number(k.slice(1))] = value;
        else if (/^s\d+$/.test(k)) applyDiff(array[Number(k.slice(1))] ??= {}, value);
      }
    } else {
      applyDiff(target[field] && typeof target[field] === "object" ? target[field] : (target[field] = {}), sub);
    }
  }
};

export const applyUpdate = (doc, update) => {
  if (update.$v === 2 && update.diff) { applyDiff(doc, update.diff); return true; }
  if (update.$set || update.$unset) {
    for (const [path, value] of Object.entries(update.$set || {})) setPath(doc, path, value);
    for (const path of Object.keys(update.$unset || {})) unsetPath(doc, path);
    return true;
  }
  return false; // unknown format: reported, not applied
};
const setPath = (doc, path, value) => {
  const parts = path.split("."); let node = doc;
  for (const part of parts.slice(0, -1)) node = node[part] ??= {};
  node[parts.at(-1)] = value;
};
const unsetPath = (doc, path) => {
  const parts = path.split("."); let node = doc;
  for (const part of parts.slice(0, -1)) { node = node?.[part]; if (!node) return; }
  delete node[parts.at(-1)];
};

const run = async () => {
  const args = process.argv.slice(2);
  const [from, to] = args;
  const apply = args.includes("--apply");
  const skip = args.flatMap((a, i) => (a === "--skip-session" ? [args[i + 1]] : []));
  if (!from || !to) throw new Error("Usage: node src/scripts/replayOplogUpdates.js <fromISO> <toISO> [--skip-session <lsidPrefix>] [--apply]");

  await connectDB();
  const live = mongoose.connection.db.collection("registrations");
  const oplog = mongoose.connection.client.db("local").collection("oplog.rs");
  const docs = await live.find({}).toArray();
  let changed = 0;

  for (const doc of docs) {
    const updates = await oplog.find({ ns: "SIST.registrations", op: "u", "o2._id": doc._id, wall: { $gt: new Date(from), $lt: new Date(to) } }).sort({ $natural: 1 }).toArray();
    if (!updates.length) continue;
    let applied = 0, skipped = 0;
    for (const entry of updates) {
      if (skip.some((prefix) => String(entry.lsid?.id || "").startsWith(prefix))) { skipped++; continue; }
      if (applyUpdate(doc, entry.o)) applied++;
      else console.log(`  UNKNOWN update format for ${doc.teamId}: ${JSON.stringify(entry.o).slice(0, 120)}`);
    }
    if (!applied) continue;
    changed++;
    console.log(`${apply ? "UPDATED" : "WOULD UPDATE"} ${doc.teamId} ${doc.teamName} | ${applied} change(s)${skipped ? `, ${skipped} skipped` : ""} | members ${(doc.members || []).length} | theme ${doc.projectTheme || "-"} | email ${doc.registrationEmail?.status}`);
    if (apply) await live.replaceOne({ _id: doc._id }, doc);
  }
  console.log(`\n${apply ? "Updated" : "Would update"} ${changed} team(s).${apply ? "" : " Preview only; add --apply to write."}`);
};

// Run only when called directly (restoreFromOplog.js imports applyUpdate).
if (process.argv[1] === fileURLToPath(import.meta.url)) run()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

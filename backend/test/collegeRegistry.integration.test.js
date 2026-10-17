// Integration tests: registration save hook, registry admin actions, reprocessing and audit — against a temporary
// database (dexathon_test_<time>) on the configured cluster, dropped afterwards. Never touches the real database.
// Skipped when no MONGO_URI is configured.
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import mongoose from "mongoose";
import College from "../src/models/College.js";
import CollegeAlias from "../src/models/CollegeAlias.js";
import CollegeAudit from "../src/models/CollegeAudit.js";
import Registration from "../src/models/Registration.js";
import { addCollegeAlias, createCollege, mergeCollege, resolveRegistrationCollege } from "../src/controllers/collegesController.js";
import { invalidateCollegeIndex, reprocessRegistrations, seedCollegeRegistry } from "../src/services/collegeRegistry.js";

const uri = process.env.MONGO_URI || process.env.mongo_uri;
const dbName = `dexathon_test_${Date.now()}`;
const admin = { username: "test-admin@example.com" };
// Minimal Express request/response stand-ins for calling controllers directly.
const call = async (handler, body = {}, params = {}) => {
  let status = 200, payload;
  const res = { status(code) { status = code; return this; }, json(data) { payload = data; return this; } };
  await handler({ body, params, query: {}, admin }, res);
  return { status, body: payload };
};
let seq = 0;
const register = (college, extra = {}) => Registration.create({ teamId: `TST${String(++seq).padStart(3, "0")}`, registrationNumber: `RT-${seq}`, teamName: `Team ${seq}`, college, collegeName: college, leader: { name: "Head", email: `head${seq}@example.com` }, ...extra });

describe("college registry (integration)", { skip: !uri && "MONGO_URI not configured" }, () => {
  before(async () => {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 15000 });
    assert.ok(mongoose.connection.db.databaseName.startsWith("dexathon_test_"), "tests must run on a temporary database");
    await Promise.all([College.init(), CollegeAlias.init(), Registration.init()]);
    invalidateCollegeIndex();
    await seedCollegeRegistry({ actor: "test" });
  });
  after(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db.databaseName.startsWith("dexathon_test_")) await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  });

  test("registration keeps the raw value and stores the resolved collegeId", async () => {
    const team = await register("Sathyabama University");
    assert.equal(team.collegeId, "sathyabama");
    assert.equal(team.collegeNameRaw, "Sathyabama University");
    assert.equal(team.college, "Sathyabama University", "submitted value is unchanged");
    assert.equal(team.collegeMatch.status, "matched");
    assert.equal(team.collegeMatch.method, "alias");
  });

  test("verified variants count as one college", async () => {
    const names = ["SIST", "SATHYABAMA INSTITUTE OF SCIENCE AND TECHNOLOGY", "sathyabama institute of science and teachnology"];
    const teams = await Promise.all(names.map((n) => register(n)));
    assert.deepEqual([...new Set(teams.map((t) => t.collegeId))], ["sathyabama"]);
  });

  test("distinct institutions stay separate", async () => {
    const [ce, it, cet] = await Promise.all([register("St Joseph's College of Engineering"), register("St Joseph's Institute of Technology"), register("St Joseph's College of engineering and technology")]);
    assert.deepEqual([ce.collegeId, it.collegeId, cet.collegeId], ["st-josephs-ce", "st-josephs-it", "st-josephs-cet"]);
  });

  test("ambiguous names are flagged for review, not merged", async () => {
    const team = await register("St. Joseph's");
    assert.equal(team.collegeId, null);
    assert.equal(team.collegeMatch.status, "review");
    assert.ok(team.collegeMatch.candidates.length >= 2);
  });

  test("changing the submitted college re-resolves it", async () => {
    const team = await register("SRMIST Ramapuram");
    assert.equal(team.collegeId, "srmist");
    team.college = "Panimalar engineering college";
    await team.save();
    assert.equal(team.collegeId, "panimalar-ec");
    assert.equal(team.collegeNameRaw, "Panimalar engineering college");
  });

  test("an unknown college stays unresolved until an admin adds it; reprocessing then updates history", async () => {
    const team = await register("KCG COLLEGE OF TECHNOLOGY");
    assert.equal(team.collegeId, null);
    const created = await call(createCollege, { name: "KCG College of Technology", cities: "Chennai" });
    assert.equal(created.status, 201);
    const summary = await reprocessRegistrations({ actor: "test" });
    assert.ok(summary.changed >= 1);
    const after = await Registration.findById(team._id).lean();
    assert.equal(after.collegeId, created.body.college.collegeId);
    assert.equal(after.collegeNameRaw, "KCG COLLEGE OF TECHNOLOGY", "raw value preserved");
  });

  test("creating a college never duplicates an existing one", async () => {
    const dup = await call(createCollege, { name: "sathyabama institute of science & technology" });
    assert.equal(dup.status, 409);
    const byAlias = await call(createCollege, { name: "SIST" });
    assert.equal(byAlias.status, 409);
  });

  test("an alias already owned by another college needs an explicit move", async () => {
    const conflict = await call(addCollegeAlias, { alias: "SIST" }, { collegeId: "srmist" });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.conflict.collegeId, "sathyabama");
    assert.equal((await CollegeAlias.findOne({ alias: "SIST" }).lean()).collegeId, "sathyabama", "unchanged without review");
    await assert.rejects(CollegeAlias.create({ alias: "sist", normalized: "sist", collegeId: "srmist" }), /duplicate key/, "database rejects conflicting aliases too");
  });

  test("admin confirmation is recorded, audited and survives reprocessing", async () => {
    const team = await register("St. Joseph's");
    const res = await call(resolveRegistrationCollege, { registrationId: String(team._id), collegeId: "st-josephs-it", rememberAlias: false });
    assert.equal(res.status, 200);
    await reprocessRegistrations({ actor: "test" });
    const after = await Registration.findById(team._id).lean();
    assert.equal(after.collegeId, "st-josephs-it");
    assert.equal(after.collegeMatch.status, "confirmed");
    assert.equal(after.collegeMatch.resolvedBy, admin.username);
    assert.ok(await CollegeAudit.exists({ action: "registration-resolve", registrationId: String(team._id) }));
  });

  test("remembering a reviewed spelling makes future registrations match automatically", async () => {
    const first = await register("St Jo's Engg Coll OMR");
    assert.notEqual(first.collegeMatch.status, "matched");
    const res = await call(resolveRegistrationCollege, { registrationId: String(first._id), collegeId: "st-josephs-ce", rememberAlias: true });
    assert.equal(res.status, 200);
    const second = await register("St Jo's Engg Coll OMR");
    assert.equal(second.collegeId, "st-josephs-ce");
    assert.equal(second.collegeMatch.method, "alias");
  });

  test("merging re-points registrations and keeps the old college for history", async () => {
    const created = await call(createCollege, { name: "Panimalar Engineering College Chennai Campus" });
    assert.equal(created.status, 201);
    const source = created.body.college.collegeId;
    const team = await register("Panimalar Engineering College Chennai Campus");
    assert.equal(team.collegeId, source);
    const res = await call(mergeCollege, { intoCollegeId: "panimalar-ec" }, { collegeId: source });
    assert.equal(res.status, 200);
    assert.equal((await Registration.findById(team._id).lean()).collegeId, "panimalar-ec");
    const old = await College.findOne({ collegeId: source }).lean();
    assert.equal(old.active, false);
    assert.equal(old.mergedInto, "panimalar-ec");
    const alias = await CollegeAlias.findOne({ normalized: "panimalar engineering college chennai campus" }).lean();
    assert.equal(alias?.collegeId, "panimalar-ec", "the merged college's official name is kept as an alias of the target");
    const later = await register("Panimalar Engineering College Chennai Campus");
    assert.equal(later.collegeId, "panimalar-ec", "the merged name now resolves to the target");
    assert.equal(later.collegeMatch.method, "alias");
  });
});

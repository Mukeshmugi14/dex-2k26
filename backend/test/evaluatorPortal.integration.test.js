// Integration tests: Evaluator Portal sign-in (one-time code → password), sheets, averages and locking — against a
// temporary database (dexathon_test_<time>) dropped afterwards. No emails are sent: codes are planted directly.
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import mongoose from "mongoose";
import Evaluator from "../src/models/Evaluator.js";
import Registration from "../src/models/Registration.js";
import RubricEvaluation from "../src/models/RubricEvaluation.js";
import { evaluatorLogin, listEvaluatorTeams, requestEvaluatorCode, saveEvaluatorSheet, setEvaluatorPassword } from "../src/controllers/evaluatorPortalController.js";
import { requireEvaluator } from "../src/middleware/evaluatorAuthMiddleware.js";
import { hashEvaluatorOtp, signCodeChallenge, evaluatorSecretConfigured } from "../src/services/evaluatorAuth.js";
import { CRITERIA } from "../src/services/rubric.js";
import { invalidateCollegeIndex } from "../src/services/collegeRegistry.js";

const uri = process.env.MONGO_URI || process.env.mongo_uri;
const dbName = `dexathon_test_${Date.now()}`;
let ipSeq = 0;
const call = async (handler, { body = {}, params = {}, headers = {}, evaluator } = {}) => {
  let status = 200, payload;
  const response = { status(c) { status = c; return this; }, json(d) { payload = d; return this; }, setHeader() {}, end() { return this; } };
  await handler({ body, params, query: {}, headers: { "x-real-ip": `10.0.0.${++ipSeq}`, ...headers }, socket: {}, evaluator }, response);
  return { status, body: payload };
};
const authAs = async (token) => {
  let passed = null;
  const res = { status() { return this; }, json() { return this; } };
  await requireEvaluator({ headers: { authorization: `Bearer ${token}` } }, res, () => { passed = true; });
  return passed;
};
const fullSheet = (level, extra = {}) => ({
  levels: Object.fromEntries(CRITERIA.map((c) => [c.id, level])),
  comments: Object.fromEntries(CRITERIA.map((c) => [c.id, "Slide 2: evidence noted"])),
  recommendation: "Recommend", coiDeclared: true, ...extra,
});

describe("evaluator portal (integration)", { skip: (!uri && "MONGO_URI not configured") || (!evaluatorSecretConfigured() && "JWT_SECRET not configured") }, () => {
  let judge, judge2, team;
  before(async () => {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 15000 });
    assert.ok(mongoose.connection.db.databaseName.startsWith("dexathon_test_"), "tests must run on a temporary database");
    await Promise.all([Evaluator.init(), RubricEvaluation.init(), Registration.init()]);
    invalidateCollegeIndex();
    judge = await Evaluator.create({ email: "judge.one@example.com", name: "Judge One" });
    judge2 = await Evaluator.create({ email: "judge.two@example.com", name: "Judge Two" });
    team = await Registration.create({ teamId: "TST900", registrationNumber: "RT-900", teamName: "Rubric Team", college: "Sathyabama", leader: { name: "Head", email: "head900@example.com" }, pdfSubmission: { fileId: new mongoose.Types.ObjectId(), fileName: "deck.pdf", fileSize: 1000, submittedAt: new Date(), status: "Submitted" } });
  });
  after(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db.databaseName.startsWith("dexathon_test_")) await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  });

  const plantCode = async (evaluator, code = "482913") => {
    await Evaluator.updateOne({ _id: evaluator._id }, { $set: { otp: { hash: hashEvaluatorOtp(evaluator._id, code), expiresAt: new Date(Date.now() + 600000), attempts: 0, sentAt: new Date(0) } } });
    return { challenge: signCodeChallenge(evaluator.email), code };
  };

  test("an unknown email gets the same reply as a real one (no account discovery)", async () => {
    const r = await call(requestEvaluatorCode, { body: { email: "nobody@example.com" } });
    assert.equal(r.status, 200);
    assert.ok(r.body.challenge);
    assert.match(r.body.message, /If this email is registered/);
  });

  test("before a password is set, sign-in points to the one-time code", async () => {
    const r = await call(evaluatorLogin, { body: { email: judge.email, password: "Anything-2026" } });
    assert.equal(r.status, 401);
    assert.equal(r.body.needsSetup, true);
  });

  test("a wrong code is refused; the right code sets the password once", async () => {
    const { challenge, code } = await plantCode(judge);
    const wrong = await call(setEvaluatorPassword, { body: { challenge, code: "000000", password: "Strong-pass-2026" } });
    assert.equal(wrong.status, 401);
    const weak = await call(setEvaluatorPassword, { body: { challenge, code, password: "short" } });
    assert.equal(weak.status, 400);
    const ok = await call(setEvaluatorPassword, { body: { challenge, code, password: "Strong-pass-2026" } });
    assert.equal(ok.status, 200);
    assert.ok(await authAs(ok.body.token));
    const reuse = await call(setEvaluatorPassword, { body: { challenge, code, password: "Another-pass-2026" } });
    assert.equal(reuse.status, 401, "a code works only once");
  });

  test("a code challenge for one email can't set another evaluator's password", async () => {
    await plantCode(judge2, "111222");
    const r = await call(setEvaluatorPassword, { body: { challenge: signCodeChallenge(judge.email), code: "111222", password: "Strong-pass-2026" } });
    assert.equal(r.status, 401);
  });

  test("after setup, email + password signs in; a wrong password doesn't", async () => {
    assert.equal((await call(evaluatorLogin, { body: { email: judge.email, password: "Wrong-pass-2026" } })).status, 401);
    const r = await call(evaluatorLogin, { body: { email: "Judge.One@Example.com", password: "Strong-pass-2026" } });
    assert.equal(r.status, 200);
    assert.ok(await authAs(r.body.token));
  });

  test("deactivating an evaluator ends their session", async () => {
    const { body } = await call(evaluatorLogin, { body: { email: judge.email, password: "Strong-pass-2026" } });
    await Evaluator.updateOne({ _id: judge._id }, { $set: { active: false }, $inc: { sessionVersion: 1 } });
    assert.equal(await authAs(body.token), null);
    await Evaluator.updateOne({ _id: judge._id }, { $set: { active: true } });
  });

  test("only the team's panel can score it", async () => {
    const outsider = { id: String(judge._id), email: judge.email, name: judge.name };
    const r = await call(saveEvaluatorSheet, { params: { id: String(team._id) }, body: { levels: { C1: 3 } }, evaluator: outsider });
    assert.equal(r.status, 403);
    assert.equal(r.body.notAssigned, true);
  });

  test("drafts save incomplete; submitting needs every rule; the team gets the average", async () => {
    const as1 = { id: String(judge._id), email: judge.email, name: judge.name };
    const as2 = { id: String(judge2._id), email: judge2.email, name: judge2.name };
    const judge3 = await Evaluator.create({ email: "judge.three@example.com", name: "Judge Three" });
    await Registration.updateOne({ _id: team._id }, { $set: { evaluationPanel: [judge._id, judge2._id, judge3._id] } });
    const draft = await call(saveEvaluatorSheet, { params: { id: String(team._id) }, body: { levels: { C1: 3 } }, evaluator: as1 });
    assert.equal(draft.status, 200);
    assert.equal(draft.body.sheet.status, "draft");
    const incomplete = await call(saveEvaluatorSheet, { params: { id: String(team._id) }, body: { levels: { C1: 3 }, submit: true }, evaluator: as1 });
    assert.equal(incomplete.status, 400);
    assert.equal((await call(saveEvaluatorSheet, { params: { id: String(team._id) }, body: { ...fullSheet(4), submit: true }, evaluator: as1 })).status, 200);
    assert.equal((await call(saveEvaluatorSheet, { params: { id: String(team._id) }, body: { ...fullSheet(3), submit: true }, evaluator: as2 })).status, 200);
    let t = await Registration.findById(team._id).lean();
    assert.equal(t.evaluation.totalScore, 70, "average of 80 and 60");
    assert.equal(t.evaluation.evaluatorCount, 2);
    assert.equal(t.evaluation.scoreComplete, false, "2 of 3 is provisional");
    const as3 = { id: String(judge3._id), email: judge3.email, name: judge3.name };
    assert.equal((await call(saveEvaluatorSheet, { params: { id: String(team._id) }, body: { ...fullSheet(5), submit: true }, evaluator: as3 })).status, 200);
    t = await Registration.findById(team._id).lean();
    assert.equal(t.evaluation.totalScore, 80, "final = average of 80, 60 and 100");
    assert.equal(t.evaluation.scoreComplete, true);
    assert.equal(t.evaluation.scoreSpread, 40);
    const list = await call(listEvaluatorTeams, { evaluator: as2 });
    const row = list.body.teams.find((x) => x.teamId === "TST900");
    assert.equal(row.myStatus, "submitted");
    assert.equal(row.myTotal, 60, "an evaluator sees only their own total");
  });

  test("once the organisers decide the result, sheets are locked", async () => {
    await Registration.updateOne({ _id: team._id }, { $set: { "evaluation.result": "Selected" } });
    const r = await call(saveEvaluatorSheet, { params: { id: String(team._id) }, body: { ...fullSheet(5), submit: true }, evaluator: { id: String(judge._id), email: judge.email, name: judge.name } });
    assert.equal(r.status, 403);
  });
});

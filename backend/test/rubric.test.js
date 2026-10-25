// Unit tests: PPT Evaluation Sheet scoring (rubric DEX2K26-PPT v1.0) and evaluator sign-in helpers.
import "dotenv/config";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CRITERIA, cleanSheet, commentRequired, marksFor, totalFor } from "../src/services/rubric.js";
import { evaluatorOtpMatches, evaluatorPasswordProblem, evaluatorSecretConfigured, generateEvaluatorOtp, hashEvaluatorOtp, signCodeChallenge, signEvaluatorSession, verifyCodeChallenge, verifyEvaluatorSession } from "../src/services/evaluatorAuth.js";

const allLevels = (level) => Object.fromEntries(CRITERIA.map((c) => [c.id, level]));

describe("PPT Evaluation Sheet scoring", () => {
  test("the 11 criteria add up to 100 marks", () => {
    assert.equal(CRITERIA.length, 11);
    assert.equal(CRITERIA.reduce((s, c) => s + c.max, 0), 100);
  });

  test("marks = Max × Level ÷ 5, as printed on the sheet", () => {
    const c2 = CRITERIA.find((c) => c.id === "C2");
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((l) => marksFor(c2, l)), [0, 2.4, 4.8, 7.2, 9.6, 12]);
    const c1 = CRITERIA.find((c) => c.id === "C1");
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((l) => marksFor(c1, l)), [0, 1.6, 3.2, 4.8, 6.4, 8]);
  });

  test("total is the sum of the criteria (level 5 everywhere = 100, level 3 = 60)", () => {
    assert.equal(totalFor(allLevels(5)), 100);
    assert.equal(totalFor(allLevels(3)), 60);
    assert.equal(totalFor({}), 0);
  });

  test("evidence comments are optional at every level", () => {
    for (const level of [0, 1, 2, 3, 4, 5]) assert.ok(!commentRequired("C1", level) && !commentRequired("C6", level));
    const levels = Object.fromEntries(CRITERIA.map((c) => [c.id, 5]));
    assert.deepEqual(cleanSheet({ levels, recommendation: "Recommend", coiDeclared: true }, { submit: true }).errors, {});
  });

  test("a draft may be incomplete; submitting enforces every rule", () => {
    assert.deepEqual(cleanSheet({ levels: { C1: 3 } }).errors, {});
    const { errors } = cleanSheet({ levels: { C1: 5 } }, { submit: true });
    assert.ok(!errors["comment.C1"], "no comment needed");
    assert.ok(errors["level.C2"], "every criterion needs a level");
    assert.ok(errors.recommendation && errors.coiDeclared);
  });

  test("a complete sheet is accepted", () => {
    const comments = Object.fromEntries(CRITERIA.map((c) => [c.id, "Slide 3: clear architecture"]));
    const { value, errors } = cleanSheet({ levels: allLevels(4), comments, recommendation: "Recommend", coiDeclared: true }, { submit: true });
    assert.deepEqual(errors, {});
    assert.equal(value.total, 80);
  });

  test("invalid levels, unknown flags and recommendations are rejected or dropped", () => {
    const { value, errors } = cleanSheet({ levels: { C1: 7, C2: 2.5 }, policyFlags: ["Late", "Hacked"], recommendation: "Yes!" });
    assert.ok(errors["level.C1"] && errors["level.C2"]);
    assert.deepEqual(value.policyFlags, ["Late"]);
    assert.equal(value.recommendation, "");
  });
});

describe("evaluator sign-in helpers", { skip: !evaluatorSecretConfigured() && "JWT_SECRET not configured" }, () => {
  test("one-time codes are 6 digits and checked by keyed hash", () => {
    const code = generateEvaluatorOtp();
    assert.match(code, /^\d{6}$/);
    const hash = hashEvaluatorOtp("abc", code);
    assert.ok(evaluatorOtpMatches("abc", code, hash));
    assert.ok(!evaluatorOtpMatches("other-account", code, hash), "a code is bound to one account");
    assert.ok(!evaluatorOtpMatches("abc", "12345", hash));
  });

  test("a code challenge and a session token can't be swapped", () => {
    const challenge = signCodeChallenge("Judge@Example.com");
    assert.equal(verifyCodeChallenge(challenge), "judge@example.com");
    assert.equal(verifyEvaluatorSession(challenge), null);
    const session = signEvaluatorSession({ _id: "507f1f77bcf86cd799439011", sessionVersion: 2 });
    assert.equal(verifyEvaluatorSession(session).v, 2);
    assert.equal(verifyCodeChallenge(session), null);
  });

  test("weak passwords are refused", () => {
    assert.ok(evaluatorPasswordProblem("short1", "a@b.com"));
    assert.ok(evaluatorPasswordProblem("onlyletterslong", "a@b.com"));
    assert.ok(evaluatorPasswordProblem("kumarjudge2026", "kumarjudge@b.com"));
    assert.equal(evaluatorPasswordProblem("Blue-river-2026", "judge@b.com"), "");
  });
});

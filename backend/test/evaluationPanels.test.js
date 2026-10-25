// Unit tests: Round 1 evaluation panels (3 evaluators per PPT) and the final-score rule.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { planPanels } from "../src/services/evaluationPanels.js";
import { scoreFromSheets } from "../src/services/rubricScores.js";

const teams = (n) => Array.from({ length: n }, (_, i) => ({ _id: `t${String(i).padStart(3, "0")}`, evaluationPanel: [] }));
const evaluators = (n) => Array.from({ length: n }, (_, i) => `e${i}`);
const loads = (plan) => { const m = new Map(); for (const p of plan.values()) p.forEach((id) => m.set(id, (m.get(id) || 0) + 1)); return [...m.values()]; };

describe("evaluation panels", () => {
  test("every PPT gets 3 different evaluators, spread evenly", () => {
    const plan = planPanels(teams(168), evaluators(7), new Map(), 3);
    assert.equal(plan.size, 168);
    for (const panel of plan.values()) { assert.equal(panel.length, 3); assert.equal(new Set(panel).size, 3); }
    const l = loads(plan);
    assert.equal(l.reduce((a, b) => a + b, 0), 168 * 3);
    assert.ok(Math.max(...l) - Math.min(...l) <= 1, `balanced loads, got ${l}`);
  });

  test("with fewer than 3 evaluators a panel stays short (never repeats an evaluator)", () => {
    const plan = planPanels(teams(4), evaluators(2), new Map(), 3);
    for (const panel of plan.values()) { assert.equal(panel.length, 2); assert.equal(new Set(panel).size, 2); }
  });

  test("re-running keeps existing members and only fills gaps", () => {
    const t = [{ _id: "a", evaluationPanel: ["e0", "e1", "e2"] }, { _id: "b", evaluationPanel: ["e3"] }];
    const plan = planPanels(t, evaluators(5), new Map(), 3);
    assert.ok(!plan.has("a"), "a full panel is left alone");
    assert.equal(plan.get("b")[0], "e3");
    assert.equal(plan.get("b").length, 3);
  });

  test("a disabled evaluator is replaced, unless they already submitted that team", () => {
    const t = [{ _id: "a", evaluationPanel: ["e0", "eX", "e1"] }, { _id: "b", evaluationPanel: ["e0", "eX", "e1"] }];
    const submitted = new Map([["b", new Set(["eX"])]]);
    const plan = planPanels(t, ["e0", "e1", "e2", "e3"], submitted, 3);
    assert.ok(!plan.get("a").includes("eX"), "replaced on a");
    assert.equal(plan.get("a").length, 3);
    assert.ok(!plan.has("b"), "kept on b because their sheet counts");
  });
});

describe("final score", () => {
  const sheet = (evaluator, total, status = "submitted") => ({ evaluator, total, status });
  test("final = average of the 3 panel sheets", () => {
    const s = scoreFromSheets([sheet("e0", 80), sheet("e1", 70), sheet("e2", 60)], ["e0", "e1", "e2"]);
    assert.deepEqual(s, { average: 70, count: 3, needed: 3, complete: true, spread: 20 });
  });
  test("with 2 of 3 submitted the score is provisional", () => {
    const s = scoreFromSheets([sheet("e0", 80), sheet("e1", 71), sheet("e2", 50, "draft")], ["e0", "e1", "e2"]);
    assert.equal(s.average, 75.5);
    assert.equal(s.complete, false);
  });
  test("weights: an evaluator can count double, another not at all", () => {
    const weights = new Map([["m", 2], ["r", 0], ["s", 1]]);
    const s = scoreFromSheets([sheet("m", 40), sheet("r", 90), sheet("s", 70)], ["m", "r", "s"], weights);
    assert.equal(s.average, 50, "(2×40 + 70) / 3");
    assert.equal(s.count, 2);
    assert.equal(s.complete, true, "final once every counted evaluator has submitted");
    const partial = scoreFromSheets([sheet("r", 90), sheet("s", 70)], ["m", "r", "s"], weights);
    assert.equal(partial.average, 70);
    assert.equal(partial.complete, false, "still waiting for the double-weight evaluator");
  });

  test("sheets from evaluators not on the panel don't count", () => {
    const s = scoreFromSheets([sheet("e0", 80), sheet("old", 10)], ["e0", "e1", "e2"]);
    assert.equal(s.average, 80);
    assert.equal(s.count, 1);
  });
});

// Unit tests: Round 2 prototype rubric (software and hardware).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cleanRound2Sheet, ROUND2_CRITERIA, round2TotalFor } from "../src/services/round2Rubric.js";

const all = (category, level) => Object.fromEntries(ROUND2_CRITERIA[category].map((c) => [c.id, level]));

describe("Round 2 prototype rubric", () => {
  test("software and hardware each have 4 criteria worth 100 marks", () => {
    for (const category of ["SOFTWARE", "HARDWARE"]) {
      assert.equal(ROUND2_CRITERIA[category].length, 4);
      assert.equal(ROUND2_CRITERIA[category].reduce((s, c) => s + c.max, 0), 100);
    }
  });

  test("marks = Max × Level ÷ 5", () => {
    assert.equal(round2TotalFor("SOFTWARE", all("SOFTWARE", 5)), 100);
    assert.equal(round2TotalFor("HARDWARE", all("HARDWARE", 3)), 60);
    assert.equal(round2TotalFor("SOFTWARE", { S1: 4 }), 24, "30 × 4 ÷ 5");
  });

  test("each type is scored only on its own criteria", () => {
    const { value } = cleanRound2Sheet({ levels: { S1: 5, H1: 5 } }, "HARDWARE");
    assert.deepEqual(Object.keys(value.levels), ["H1"]);
  });

  test("a draft can be partial; submitting needs every criterion, a recommendation and the declaration", () => {
    assert.deepEqual(cleanRound2Sheet({ levels: { S1: 3 } }, "SOFTWARE").errors, {});
    const { errors } = cleanRound2Sheet({ levels: { S1: 3 } }, "SOFTWARE", { submit: true });
    assert.ok(errors["level.S2"] && errors.recommendation && errors.coiDeclared);
    const ok = cleanRound2Sheet({ levels: all("SOFTWARE", 4), recommendation: "Recommend for Final", coiDeclared: true }, "SOFTWARE", { submit: true });
    assert.deepEqual(ok.errors, {});
    assert.equal(ok.value.total, 80);
  });

  test("a team without a prototype type can't be scored", () => {
    assert.ok(cleanRound2Sheet({}, null).errors.category);
  });
});

describe("Round 2 prototype link", () => {
  test("software and hardware teams may submit a website, Google Drive or YouTube link", async () => {
    const { validatePrototypeUrl } = await import("../src/services/prototypeService.js");
    for (const category of ["SOFTWARE", "HARDWARE"]) {
      for (const link of ["https://drive.google.com/file/d/1AbCdEfGhIjK/view", "drive.google.com/drive/folders/1xyz", "https://youtu.be/wUmdd152dF8", "https://my-app.vercel.app"]) {
        assert.ok(validatePrototypeUrl(category, link).url, `${category} ${link}`);
      }
      assert.ok(validatePrototypeUrl(category, "").error);
      assert.ok(validatePrototypeUrl(category, "not a link").error);
      assert.ok(validatePrototypeUrl(category, "ftp://x.com").error);
    }
  });
});

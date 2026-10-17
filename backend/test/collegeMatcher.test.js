// Unit tests for college name entity resolution (pure matcher, no database).
//   npm test    (from backend/)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildCollegeIndex, matchCollege, normalizeCollegeName } from "../src/services/collegeMatcher.js";
import { SEED_COLLEGES } from "../src/services/collegeSeed.js";

const seedIndex = () => buildCollegeIndex(SEED_COLLEGES, SEED_COLLEGES.flatMap((c) => c.aliases.map((alias) => ({ alias, collegeId: c.collegeId, verified: true }))));
const index = seedIndex();
const resolve = (raw) => matchCollege(raw, index);
const expectCollege = (raw, collegeId) => {
  const m = resolve(raw);
  assert.equal(m.status, "matched", `${raw} → ${m.status} (${JSON.stringify(m.candidates)})`);
  assert.equal(m.collegeId, collegeId, `${raw} → ${m.collegeId}`);
};
const expectNotAuto = (raw) => {
  const m = resolve(raw);
  assert.notEqual(m.status, "matched", `${raw} must not be auto-matched (got ${m.collegeId} via ${m.method})`);
  assert.equal(m.collegeId, null);
};

describe("normalizeCollegeName", () => {
  test("case, whitespace, punctuation and apostrophes", () => {
    assert.equal(normalizeCollegeName("  ST.JOSEPH’S   COLLEGE, OF ENGINEERING. "), "saint joseph college of engineering");
    assert.equal(normalizeCollegeName("St .Joseph's College"), "saint joseph college");
  });
  test("conservative abbreviation expansion keeps generic words", () => {
    assert.equal(normalizeCollegeName("Anna Univ"), "anna university");
    assert.equal(normalizeCollegeName("XYZ Engg College"), "xyz engineering college");
    assert.equal(normalizeCollegeName("Vels Institute of Science, Technology & Advanced Studies"), "vels institute of science technology and advanced studies");
  });
  test("is deterministic", () => {
    assert.equal(normalizeCollegeName("SRM Ramapuram IST"), normalizeCollegeName("SRM Ramapuram IST"));
  });
});

describe("aliases and historical names", () => {
  test("Sathyabama variants resolve to one college", () => {
    for (const raw of ["SIST", "sist", "Sathyabama", "Sathyabama University", "SATHYABAMA INSTITUTE OF SCIENCE AND TECHNOLOGY", "Sathyabama Institute of Science & Technology", "sathyabama institute of science and teachnology"]) {
      expectCollege(raw, "sathyabama");
    }
  });
  test("short names", () => {
    expectCollege("SRMIST", "srmist");
    expectCollege("VIT Chennai", "vit");
    expectCollege("YCCE", "ycce");
    expectCollege("SIMATS ENGINEERING", "simats");
  });
});

describe("spelling variations", () => {
  test("St. Joseph's College of Engineering: punctuation, typos, word order, location suffixes", () => {
    for (const raw of ["St Joseph's College of engineering", "ST.JOSEPH COLLEGE OF ENGINEERING", "St josephs college of engieering", "ST JOESPH'S COLLEGE OF ENGINEERING", "St. Joseph's Engineering College", "St.joseph college of engineering,OMR,chennai", "St Joseph's College of Engineering,off Old Mahabalipuram Road (OMR) in Semmancheri, Chennai."]) {
      expectCollege(raw, "st-josephs-ce");
    }
  });
  test("SRM campus spellings", () => {
    for (const raw of ["SRMIST RAMAPAURAM", "SRM science and technology Ramapuram", "SRM Ramapuram IST", "Srm institute of science and technology"]) expectCollege(raw, "srmist");
  });
  test("joined/split words", () => {
    expectCollege("VELTECH HIGH TECH DR RANGARAJAN DR SAKUNTALA ENGINEERING COLLEGE", "veltech-hightech");
  });
});

describe("distinct institutions stay separate", () => {
  test("St. Joseph's College of Engineering vs Institute of Technology vs College of Engineering and Technology", () => {
    expectCollege("St Joseph's Institute of Technology", "st-josephs-it");
    expectCollege("St Joseph's College of engineering and technology", "st-josephs-cet");
    expectCollege("St. Joseph's College of Engineering", "st-josephs-ce");
  });
  test("Saveetha Engineering College vs SIMATS; Dhanalakshmi vs Dhanalakshmi Srinivasan; Vel Tech vs Vels; RMD vs RMK", () => {
    expectCollege("Saveetha Engineering College", "saveetha-ec");
    expectCollege("Saveetha Institute of Medical and Technical Sciences", "simats");
    expectCollege("Dhanalakshmi College of Engineering", "dhanalakshmi-ce");
    expectCollege("Dhanalakshmi Srinivasan College of Engineering and Technology, Mamallapuram.", "dscet");
    expectCollege("Vel Tech University", "veltech-univ");
    expectCollege("Vels University", "vistas");
    expectCollege("R.M.K Engineering college", "rmk-ec");
    expectCollege("RMD Engineering College", "rmd-ec");
  });
  test("a different college sharing one distinctive word is not merged", () => {
    expectNotAuto("SRM Valliammai Engineering College");
  });
});

describe("ambiguous and unknown names are flagged, not merged", () => {
  test("incomplete names", () => {
    for (const raw of ["St. Joseph's", "Saveetha", "Dhanalakshmi", "Engineering College"]) expectNotAuto(raw);
    const m = resolve("St. Joseph's");
    assert.equal(m.status, "review");
    assert.ok(m.candidates.length >= 2, "ambiguous input should offer several candidates");
  });
  test("an entry naming several colleges", () => {
    expectNotAuto("Team Member 1 - 5 : RMD ENGINEERING COLLEGE and Team Member 6 : RMK COLLEGE OF ENGINEERING AND TECHNOLOGY");
  });
  test("unknown colleges are not forced onto a registry entry", () => {
    expectNotAuto("KCG COLLEGE OF TECHNOLOGY");
    expectNotAuto("Some Unknown College of Arts");
  });
  test("a contradicting city blocks auto-matching", () => {
    const m = resolve("St Joseph College of Engineering, Coimbatore");
    assert.equal(m.status, "review");
    assert.equal(m.candidates[0].collegeId, "st-josephs-ce");
  });
  test("empty input", () => {
    assert.equal(resolve("   ").status, "empty");
  });
});

describe("registry behaviour", () => {
  test("unverified aliases are not used for automatic matching", () => {
    const idx = buildCollegeIndex([{ collegeId: "a", name: "Alpha College of Engineering" }], [{ alias: "ACE Chennai", collegeId: "a", verified: false }]);
    assert.notEqual(matchCollege("ACE Chennai", idx).status, "matched");
  });
  test("a verified alias added later is picked up after rebuilding the index (historical reprocessing)", () => {
    assert.notEqual(resolve("KCG COLLEGE OF TECHNOLOGY").status, "matched");
    const colleges = [...SEED_COLLEGES, { collegeId: "kcg", name: "KCG College of Technology", cities: ["Chennai"], aliases: [] }];
    const idx = buildCollegeIndex(colleges, [...colleges.flatMap((c) => c.aliases.map((alias) => ({ alias, collegeId: c.collegeId, verified: true }))), { alias: "KCG Tech", collegeId: "kcg", verified: true }]);
    assert.equal(matchCollege("KCG COLLEGE OF TECHNOLOGY", idx).collegeId, "kcg");
    assert.equal(matchCollege("kcg tech", idx).collegeId, "kcg");
  });
  test("inactive (merged) colleges are never returned", () => {
    const idx = buildCollegeIndex([{ collegeId: "old", name: "Old Name College", active: false }, { collegeId: "new", name: "New Name College" }], [{ alias: "Old Name College", collegeId: "new", verified: true }]);
    assert.equal(matchCollege("Old Name College", idx).collegeId, "new");
  });
  test("results are deterministic", () => {
    for (const raw of ["St. Joseph's", "SRM science and technology Ramapuram", "KCG COLLEGE OF TECHNOLOGY"]) {
      assert.deepEqual(resolve(raw), seedIndex() && matchCollege(raw, seedIndex()));
    }
  });
});

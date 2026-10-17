// Unit tests: "how did you know about the event" channels, cross-college detection, and Google Form column mapping.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { referralCategory } from "../src/services/referralSource.js";
import { teamCollegeMix } from "../src/services/teamColleges.js";
import { detectColumns } from "../src/services/spreadsheetImportService.js";

describe("referral channels", () => {
  test("groups free-text answers into channels", () => {
    const cases = { Instagram: "Instagram", INSTAGRAM: "Instagram", friend: "Friends", "friends word of mouth": "Friends", Linkedin: "LinkedIn",
      "LinkedIn and Colleagues": "LinkedIn", "College circular": "Faculty / college", MENTOR: "Faculty / college", "Clg WhatsApp grp": "WhatsApp", CHATGPT: "Other", "": "Not answered" };
    for (const [answer, channel] of Object.entries(cases)) assert.equal(referralCategory(answer), channel, answer);
  });
});

describe("cross-college teams", () => {
  // A stand-in for createCollegeLookup(): known spellings resolve to an id, anything else is "Needs review".
  const ids = { sathyabama: "sathyabama", "satyabama university": "sathyabama", "st joseph's college of engineering": "st-josephs-ce", "vit chennai": "vit" };
  const lookup = {
    forTeam: (t) => ({ collegeId: t.collegeId, name: t.collegeId }),
    forRaw: (raw) => { const id = ids[String(raw).trim().toLowerCase()]; return id ? { collegeId: id, name: id } : { collegeId: null, name: `Needs review: ${raw}` }; },
  };
  const team = (members, collegeId = "sathyabama") => ({ collegeId, leader: { name: "Head", email: "head@example.com" }, members });

  test("one college when every member's college resolves to the team's", () => {
    const mix = teamCollegeMix(team([{ name: "A", college: "Satyabama University" }, { name: "B", college: "" }]), lookup);
    assert.equal(mix.crossCollege, false);
    assert.deepEqual(mix.colleges.map((c) => [c.collegeId, c.people]), [["sathyabama", 3]]);
  });

  test("members from another college make it cross-college, counted per college", () => {
    const mix = teamCollegeMix(team([{ name: "A", college: "St Joseph's College of Engineering" }, { name: "B", college: "Sathyabama" }]), lookup);
    assert.equal(mix.crossCollege, true);
    assert.deepEqual(mix.colleges.map((c) => [c.collegeId, c.people]), [["sathyabama", 2], ["st-josephs-ce", 1]]);
  });

  test("placeholders like NA count under the team's college", () => {
    const mix = teamCollegeMix(team([{ name: "A", college: "NA" }, { name: "B", college: "nil" }]), lookup);
    assert.equal(mix.crossCollege, false);
  });

  test("the Team Head is not counted twice when also listed as a member", () => {
    const mix = teamCollegeMix(team([{ name: "Head", college: "" }, { name: "B", college: "VIT Chennai" }]), lookup);
    assert.equal(mix.colleges.reduce((n, c) => n + c.people, 0), 2);
  });
});

describe("Google Form column mapping", () => {
  test("unnumbered college/year columns after 'Member N - Full Name' belong to that member", () => {
    const headers = ["Timestamp", "Team Name", "College Name ", "Year of Study", "Team Leader Name", "Team Leader Email",
      "Member 2 - Full Name", "College Name  2", "Year of Study 2", "Member 2 - Phone Number",
      "Member 3 - Full Name", "College name", "Year of Study 3", "Member 3 - Phone Number",
      "From where you know about this event (eg: friend, instagram, linkedin if other mension name ) "];
    const map = detectColumns(headers);
    assert.equal(map.college, "College Name ");
    assert.equal(map.memberNumbered[2].college, "College Name  2");
    assert.equal(map.memberNumbered[3].college, "College name");
    assert.equal(map.memberNumbered[3].year, "Year of Study 3");
    assert.equal(map.timestamp, "Timestamp");
    assert.match(map.referral, /^From where you know/);
  });
});

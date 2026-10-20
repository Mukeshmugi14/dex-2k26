// Integration tests: spreadsheet import duplicate rules, against a temporary database (dexathon_test_<time>) dropped
// afterwards. Same team name for a different team → renamed "2.0", "3.0"; same name + email + members → skipped.
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import mongoose from "mongoose";
import XLSX from "xlsx";
import Registration from "../src/models/Registration.js";
import { invalidateCollegeIndex } from "../src/services/collegeRegistry.js";
import { processSpreadsheetImport } from "../src/services/spreadsheetImportService.js";

const uri = process.env.MONGO_URI || process.env.mongo_uri;
const dbName = `dexathon_test_${Date.now()}`;

const row = (teamName, email, head, members) => ({
  Timestamp: "10/10/2026 21:23:04", "Team Name": teamName, "College Name ": "Sathyabama University", "Team Leader Name": head, "Team Leader Email": email,
  "Member 2 - Full Name": members[0] || "", "College Name  2": members[0] ? "Sathyabama University" : "",
  "Member 3 - Full Name": members[1] || "", "College name": members[1] ? "Sathyabama University" : "",
});
const sheet = (rows) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Form responses 1");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
};

describe("spreadsheet import duplicates (integration)", { skip: !uri && "MONGO_URI not configured" }, () => {
  before(async () => {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 15000 });
    assert.ok(mongoose.connection.db.databaseName.startsWith("dexathon_test_"), "tests must run on a temporary database");
    await Registration.init();
    invalidateCollegeIndex();
  });
  after(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db.databaseName.startsWith("dexathon_test_")) await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  });

  test("a repeated team name for different teams gets 2.0, 3.0; an exact repeat is skipped", async () => {
    const result = await processSpreadsheetImport(sheet([
      row("Code Crushers", "a@example.com", "Asha", ["Bala", "Chitra"]),
      row("Code Crushers", "a@example.com", "Asha", ["Bala", "Chitra"]), // exact duplicate
      row("code crushers", "d@example.com", "Deepak", ["Esha", "Farhan"]), // different team, same name
      row("Code Crushers", "g@example.com", "Gita", ["Hari", "Indu"]), // another one
    ]));
    assert.equal(result.summary.importedCount, 3);
    assert.equal(result.summary.duplicateCount, 1);
    assert.equal(result.summary.renamedCount, 2);
    const names = (await Registration.find({}, "teamName leader.email").sort({ teamId: 1 }).lean()).map((t) => [t.leader.email, t.teamName]);
    assert.deepEqual(names, [["a@example.com", "Code Crushers"], ["d@example.com", "code crushers 2.0"], ["g@example.com", "Code Crushers 3.0"]]);
  });

  test("uploading the same sheet again adds nothing and renames nothing", async () => {
    const result = await processSpreadsheetImport(sheet([
      row("Code Crushers", "a@example.com", "Asha", ["Bala", "Chitra"]),
      row("code crushers", "d@example.com", "Deepak", ["Esha", "Farhan"]),
    ]));
    assert.equal(result.summary.importedCount, 0);
    assert.equal(result.summary.renamedCount, 0);
    assert.equal(await Registration.countDocuments(), 3);
  });

  test("same name and members under a corrected Team Head email is not imported again", async () => {
    const result = await processSpreadsheetImport(sheet([row("Code Crushers", "a@example.co", "Asha", ["Bala", "Chitra"])]));
    assert.equal(result.summary.importedCount, 0);
    assert.match(result.invalidRecords[0].reason, /Already on the site/);
  });

  test("same team name and Team Head under another email is never added again, even with other members", async () => {
    const before = await Registration.countDocuments();
    const result = await processSpreadsheetImport(sheet([
      row("Code Crushers", "asha.new@example.com", "Asha", ["Manoj", "Nila"]),
      row("Code Crushers 2.0", "asha.other@example.com", "Asha", ["Manoj"]),
    ]));
    assert.equal(result.summary.importedCount, 0);
    assert.equal(result.summary.renamedCount, 0);
    assert.match(result.invalidRecords[0].reason, /same team name and Team Head/);
    assert.equal(await Registration.countDocuments(), before);
  });

  test("in one file, a repeat of the same team name and Team Head with another email imports only the first row", async () => {
    const result = await processSpreadsheetImport(sheet([
      row("Quantum Quokkas", "q1@example.com", "Ravi", ["Sita"]),
      row("Quantum Quokkas", "q2@example.com", "Ravi", ["Tara"]),
    ]));
    assert.equal(result.summary.importedCount, 1);
    assert.match(result.invalidRecords[0].reason, /Same team name and Team Head as row 2/);
  });

  test("the same Team Head email with a different team in one file imports only the first row", async () => {
    const result = await processSpreadsheetImport(sheet([
      row("Byte Bandits", "j@example.com", "Jaya", ["Kiran"]),
      row("Pixel Pirates", "j@example.com", "Jaya", ["Leela"]),
    ]));
    assert.equal(result.summary.importedCount, 1);
    assert.match(result.invalidRecords[0].reason, /Same Team Head email as row 2/);
  });
});

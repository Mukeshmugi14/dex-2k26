// Database side of college entity resolution: cached matching index, applying results to registrations,
// audit records, registry seeding and reprocessing of historical registrations.
import mongoose from "mongoose";
import College from "../models/College.js";
import CollegeAlias from "../models/CollegeAlias.js";
import CollegeAudit from "../models/CollegeAudit.js";
import { buildCollegeIndex, matchCollege, normalizeCollegeName } from "./collegeMatcher.js";
import { SEED_COLLEGES } from "./collegeSeed.js";

// The index is built once and reused until the registry changes (any admin edit calls invalidateCollegeIndex),
// so fuzzy matching runs only for names that aren't exact/alias hits, and repeated names are memoized.
let cache = null;
export const invalidateCollegeIndex = () => { cache = null; };
export const getCollegeIndex = async () => {
  if (cache) return cache;
  const [colleges, aliases] = await Promise.all([College.find({}).lean(), CollegeAlias.find({}).lean()]);
  cache = { index: buildCollegeIndex(colleges, aliases), colleges, memo: new Map() };
  return cache;
};
export const resolveCollegeName = async (raw) => {
  const { index, memo } = await getCollegeIndex();
  const key = normalizeCollegeName(raw);
  if (!memo.has(key)) memo.set(key, matchCollege(raw, index));
  return memo.get(key);
};

export const audit = (entry) => CollegeAudit.create(entry).catch((error) => console.error("College audit write failed:", error.message));

/**
 * The resolution fields for a registration whose submitted college is `raw`.
 * An admin confirmation is kept as long as the submitted value hasn't changed.
 */
export const resolutionFor = async (raw, previous = {}) => {
  const value = String(raw ?? "").trim();
  if (previous.collegeMatch?.status === "confirmed" && previous.collegeNameRaw === value) return null;
  const match = await resolveCollegeName(value);
  return {
    collegeNameRaw: value,
    collegeId: match.status === "matched" ? match.collegeId : null,
    collegeMatch: { method: match.method, confidence: match.confidence, status: match.status, candidates: match.candidates, note: match.note || "", resolvedAt: new Date(), resolvedBy: "system" },
  };
};

/** Sets the resolution fields on a Mongoose registration document (used by the save hook). */
export const applyCollegeResolution = async (doc) => {
  const fields = await resolutionFor(doc.college || doc.collegeName, doc);
  if (fields) doc.set(fields);
};

/** Adds every seed college and verified alias that isn't in the registry yet. Existing entries are left untouched. */
export const seedCollegeRegistry = async ({ actor = "migration" } = {}) => {
  const created = { colleges: 0, aliases: 0, conflicts: [] };
  for (const seed of SEED_COLLEGES) {
    const exists = await College.exists({ collegeId: seed.collegeId });
    if (!exists) { await College.create({ collegeId: seed.collegeId, name: seed.name, cities: seed.cities, source: "seed", verified: true, createdBy: actor }); created.colleges++; }
    for (const alias of seed.aliases) {
      const normalized = normalizeCollegeName(alias);
      const existing = await CollegeAlias.findOne({ normalized }).lean();
      if (existing) { if (existing.collegeId !== seed.collegeId) created.conflicts.push({ alias, existing: existing.collegeId, wanted: seed.collegeId }); continue; }
      await CollegeAlias.create({ alias, normalized, collegeId: seed.collegeId, verified: true, source: "seed", createdBy: actor });
      created.aliases++;
    }
  }
  invalidateCollegeIndex();
  if (created.colleges || created.aliases) await audit({ action: "migration", actor, note: `Seeded ${created.colleges} colleges and ${created.aliases} aliases`, after: created });
  return created;
};

/**
 * Re-runs matching for historical registrations (after aliases or mappings change).
 * Admin-confirmed mappings are kept unless the submitted college changed; `apply: false` only reports.
 */
export const reprocessRegistrations = async ({ actor = "system", apply = true } = {}) => {
  invalidateCollegeIndex();
  const Registration = mongoose.model("Registration");
  const teams = await Registration.find({}, "teamId college collegeName collegeNameRaw collegeId collegeMatch").lean();
  const summary = { total: teams.length, changed: 0, matched: 0, review: 0, unresolved: 0, confirmed: 0, changes: [] };
  const ops = [];
  for (const team of teams) {
    const fields = await resolutionFor(team.college || team.collegeName, team);
    const status = fields ? fields.collegeMatch.status : team.collegeMatch?.status;
    if (status === "matched") summary.matched++; else if (status === "review") summary.review++; else if (status === "confirmed") summary.confirmed++; else summary.unresolved++;
    if (!fields) continue;
    const changed = fields.collegeId !== (team.collegeId ?? null) || fields.collegeMatch.status !== team.collegeMatch?.status || fields.collegeNameRaw !== team.collegeNameRaw;
    if (!changed) continue;
    summary.changed++;
    summary.changes.push({ teamId: team.teamId, raw: fields.collegeNameRaw, from: team.collegeId || null, to: fields.collegeId, status: fields.collegeMatch.status });
    ops.push({ updateOne: { filter: { _id: team._id }, update: { $set: fields } } });
  }
  if (apply && ops.length) await Registration.bulkWrite(ops, { ordered: false });
  if (apply) await audit({ action: "reprocess", actor, note: `Reprocessed ${summary.total} registrations, ${summary.changed} changed`, after: { ...summary, changes: summary.changes.slice(0, 200) } });
  return summary;
};

/**
 * Display lookup for analytics, exports and lists: registry names by collegeId, and resolution of other submitted
 * names (e.g. members' colleges) through the same cached matcher. Unresolved names are labelled, never merged.
 */
export const createCollegeLookup = async () => {
  const { colleges } = await getCollegeIndex();
  const names = new Map(colleges.map((c) => [c.collegeId, c.name]));
  const unresolved = (raw) => {
    const text = String(raw ?? "").trim().replace(/\s+/g, " ");
    return text ? { collegeId: null, name: `Needs review: ${text}`, unresolved: true } : { collegeId: null, name: "", unresolved: false };
  };
  const byRaw = new Map();
  return {
    nameOf: (collegeId) => names.get(collegeId) || collegeId,
    /** A registration's college: its stored collegeId, or its raw value flagged for review. */
    forTeam: (team) => (team.collegeId ? { collegeId: team.collegeId, name: names.get(team.collegeId) || team.collegeId } : unresolved(team.collegeNameRaw ?? team.college ?? team.collegeName)),
    /** Resolves a list of raw names (e.g. members' colleges) in one pass; call before forRaw. */
    prepare: async (raws) => {
      for (const raw of new Set(raws.map((r) => String(r ?? "").trim()).filter(Boolean))) {
        if (byRaw.has(raw)) continue;
        const m = await resolveCollegeName(raw);
        byRaw.set(raw, m.status === "matched" ? { collegeId: m.collegeId, name: names.get(m.collegeId) || m.collegeId } : unresolved(raw));
      }
    },
    forRaw: (raw) => byRaw.get(String(raw ?? "").trim()) || unresolved(raw),
  };
};

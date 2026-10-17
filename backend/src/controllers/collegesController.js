import mongoose from "mongoose";
import College from "../models/College.js";
import CollegeAlias from "../models/CollegeAlias.js";
import CollegeAudit from "../models/CollegeAudit.js";
import Registration from "../models/Registration.js";
import { normalizeCollegeName } from "../services/collegeMatcher.js";
import { audit, invalidateCollegeIndex, reprocessRegistrations } from "../services/collegeRegistry.js";

// Admin → Colleges: the college registry, the review queue of uncertain matches, and the audit log.
const clean = (value, max = 160) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const cleanCities = (value) => (Array.isArray(value) ? value : String(value || "").split(",")).map((c) => clean(c, 60)).filter(Boolean).slice(0, 12);
const actorOf = (request) => request.admin?.username || "admin";
const slug = (name) => normalizeCollegeName(name).split(" ").filter((w) => !["of", "and", "the", "for", "at", "in"].includes(w)).join("-").slice(0, 48) || "college";

// Adds `alias` to a college. A spelling already owned by another college is a conflict unless `move` is set,
// which is the explicit review step for re-assigning it.
const addAliasTo = async ({ collegeId, alias, verified = true, source = "admin", move = false, actor }) => {
  const normalized = normalizeCollegeName(alias);
  if (!normalized) return { error: "Enter an alias." };
  const existing = await CollegeAlias.findOne({ normalized });
  const ownsName = (await College.find({ active: true }, "collegeId name").lean()).find((c) => normalizeCollegeName(c.name) === normalized);
  if (ownsName && ownsName.collegeId !== collegeId) return { conflict: { type: "canonical-name", collegeId: ownsName.collegeId, name: ownsName.name } };
  if (existing && existing.collegeId === collegeId) {
    if (verified && !existing.verified) { existing.verified = true; existing.verifiedBy = actor; existing.verifiedAt = new Date(); await existing.save(); }
    return { alias: existing.toObject(), unchanged: true };
  }
  if (existing && !move) return { conflict: { type: "alias", collegeId: existing.collegeId, alias: existing.alias } };
  if (existing) {
    const before = existing.toObject();
    existing.collegeId = collegeId; existing.verified = verified; existing.verifiedBy = actor; existing.verifiedAt = new Date();
    await existing.save();
    await audit({ action: "alias-move", actor, collegeId, before, after: existing.toObject(), note: `Moved "${existing.alias}" from ${before.collegeId} to ${collegeId}` });
    return { alias: existing.toObject() };
  }
  const created = await CollegeAlias.create({ alias: clean(alias), normalized, collegeId, verified, source, createdBy: actor, ...(verified ? { verifiedBy: actor, verifiedAt: new Date() } : {}) });
  await audit({ action: "alias-add", actor, collegeId, after: created.toObject() });
  return { alias: created.toObject() };
};

export const getCollegeRegistry = async (_request, response) => {
  const [colleges, aliases, usage, raw] = await Promise.all([
    College.find({}).sort({ active: -1, name: 1 }).lean(),
    CollegeAlias.find({}).sort({ alias: 1 }).lean(),
    Registration.aggregate([{ $group: { _id: "$collegeId", teams: { $sum: 1 } } }]),
    Registration.aggregate([{ $match: { collegeId: { $ne: null } } }, { $group: { _id: { collegeId: "$collegeId", raw: "$collegeNameRaw" }, count: { $sum: 1 } } }]),
  ]);
  const teamsBy = new Map(usage.map((u) => [u._id, u.teams]));
  const variantsBy = new Map();
  for (const r of raw) variantsBy.set(r._id.collegeId, [...(variantsBy.get(r._id.collegeId) || []), { raw: r._id.raw || "", count: r.count }]);
  return response.json({
    colleges: colleges.map((c) => ({
      collegeId: c.collegeId, name: c.name, cities: c.cities || [], active: c.active !== false, mergedInto: c.mergedInto || null, source: c.source,
      teams: teamsBy.get(c.collegeId) || 0,
      aliases: aliases.filter((a) => a.collegeId === c.collegeId).map((a) => ({ id: String(a._id), alias: a.alias, verified: a.verified !== false, source: a.source })),
      variants: (variantsBy.get(c.collegeId) || []).sort((a, b) => b.count - a.count),
    })),
    unresolvedTeams: teamsBy.get(null) || 0,
  });
};

export const getCollegeReview = async (_request, response) => {
  const teams = await Registration.find({ $or: [{ collegeId: null }, { collegeId: { $exists: false } }] }, "teamId teamName leader.email college collegeNameRaw collegeMatch").sort({ teamId: 1 }).lean();
  return response.json({
    items: teams.map((t) => ({
      id: String(t._id), teamId: t.teamId, teamName: t.teamName, email: t.leader?.email || "",
      raw: t.collegeNameRaw ?? t.college ?? "",
      status: t.collegeMatch?.status || "unresolved", method: t.collegeMatch?.method || "none", confidence: t.collegeMatch?.confidence || 0,
      note: t.collegeMatch?.note || "", candidates: t.collegeMatch?.candidates || [],
    })),
  });
};

// Creates a registry college. Never creates a duplicate: an existing official name or alias is reported instead.
const createCollegeRecord = async ({ name: rawName, cities, collegeId: wantedId, actor }) => {
  const name = clean(rawName);
  if (!name) return { code: 400, message: "Enter the college's official name." };
  const normalized = normalizeCollegeName(name);
  const sameName = (await College.find({ active: true }, "collegeId name").lean()).find((c) => normalizeCollegeName(c.name) === normalized);
  if (sameName) return { code: 409, message: `"${sameName.name}" is already in the registry.`, collegeId: sameName.collegeId };
  const takenAlias = await CollegeAlias.findOne({ normalized }).lean();
  if (takenAlias) return { code: 409, message: `"${name}" is already an alias of ${takenAlias.collegeId}. Assign that college instead.`, collegeId: takenAlias.collegeId };
  let collegeId = clean(wantedId, 48).toLowerCase().replace(/[^a-z0-9-]/g, "") || slug(name);
  for (let n = 2; await College.exists({ collegeId }); n++) collegeId = `${slug(name)}-${n}`;
  const college = await College.create({ collegeId, name, cities: cleanCities(cities), source: "admin", createdBy: actor });
  await audit({ action: "college-create", actor, collegeId, after: college.toObject() });
  invalidateCollegeIndex();
  return { college };
};

export const createCollege = async (request, response) => {
  const result = await createCollegeRecord({ ...request.body, actor: actorOf(request) });
  if (!result.college) return response.status(result.code).json({ message: result.message, collegeId: result.collegeId });
  return response.status(201).json({ message: `Added ${result.college.name}.`, college: result.college });
};

export const updateCollege = async (request, response) => {
  const college = await College.findOne({ collegeId: request.params.collegeId });
  if (!college) return response.status(404).json({ message: "College not found." });
  const before = college.toObject();
  const name = request.body.name === undefined ? college.name : clean(request.body.name);
  if (!name) return response.status(400).json({ message: "Enter the college's official name." });
  if (request.body.name !== undefined && normalizeCollegeName(name) !== normalizeCollegeName(college.name)) {
    // The previous official name becomes a verified (historical) alias, so old registrations keep matching.
    const kept = await addAliasTo({ collegeId: college.collegeId, alias: college.name, actor: actorOf(request) });
    if (kept.conflict) return response.status(409).json({ message: "The previous name is used by another college; resolve that first.", conflict: kept.conflict });
  }
  college.name = name;
  if (request.body.cities !== undefined) college.cities = cleanCities(request.body.cities);
  await college.save();
  await audit({ action: "college-edit", actor: actorOf(request), collegeId: college.collegeId, before, after: college.toObject() });
  invalidateCollegeIndex();
  return response.json({ message: "College updated.", college });
};

export const addCollegeAlias = async (request, response) => {
  if (!(await College.exists({ collegeId: request.params.collegeId, active: true }))) return response.status(404).json({ message: "College not found." });
  const result = await addAliasTo({ collegeId: request.params.collegeId, alias: request.body.alias, verified: request.body.verified !== false, move: request.body.move === true, actor: actorOf(request) });
  if (result.error) return response.status(400).json({ message: result.error });
  if (result.conflict) return response.status(409).json({ message: result.conflict.type === "alias" ? `"${result.conflict.alias}" already belongs to ${result.conflict.collegeId}. Confirm to move it.` : `That is the official name of ${result.conflict.name}.`, conflict: result.conflict });
  invalidateCollegeIndex();
  return response.status(result.unchanged ? 200 : 201).json({ message: result.unchanged ? "Alias already present." : "Alias added.", alias: result.alias });
};

export const updateCollegeAlias = async (request, response) => {
  const alias = mongoose.isValidObjectId(request.params.aliasId) ? await CollegeAlias.findOne({ _id: request.params.aliasId, collegeId: request.params.collegeId }) : null;
  if (!alias) return response.status(404).json({ message: "Alias not found." });
  const before = alias.toObject();
  alias.verified = request.body.verified !== false;
  if (alias.verified) { alias.verifiedBy = actorOf(request); alias.verifiedAt = new Date(); }
  await alias.save();
  await audit({ action: "alias-verify", actor: actorOf(request), collegeId: alias.collegeId, before, after: alias.toObject() });
  invalidateCollegeIndex();
  return response.json({ message: alias.verified ? "Alias verified." : "Alias marked unverified.", alias });
};

export const deleteCollegeAlias = async (request, response) => {
  const alias = mongoose.isValidObjectId(request.params.aliasId) ? await CollegeAlias.findOne({ _id: request.params.aliasId, collegeId: request.params.collegeId }) : null;
  if (!alias) return response.status(404).json({ message: "Alias not found." });
  await alias.deleteOne();
  await audit({ action: "alias-remove", actor: actorOf(request), collegeId: alias.collegeId, before: alias.toObject() });
  invalidateCollegeIndex();
  return response.json({ message: "Alias removed. Reprocess to update registrations that relied on it." });
};

// Merge: the source college becomes inactive (kept for history), its aliases and official name move to the target,
// and registrations pointing at it are re-pointed. Registration data itself is not changed.
export const mergeCollege = async (request, response) => {
  const source = await College.findOne({ collegeId: request.params.collegeId, active: true });
  const target = await College.findOne({ collegeId: clean(request.body.intoCollegeId, 48), active: true });
  if (!source || !target) return response.status(404).json({ message: "Both colleges must exist and be active." });
  if (source.collegeId === target.collegeId) return response.status(400).json({ message: "Choose a different college to merge into." });
  const actor = actorOf(request);
  const before = source.toObject();
  // Deactivate the source first, so its official name is free to become an alias of the target.
  source.active = false; source.mergedInto = target.collegeId;
  await source.save();
  const movedAliases = await CollegeAlias.updateMany({ collegeId: source.collegeId }, { $set: { collegeId: target.collegeId } });
  const keptName = await addAliasTo({ collegeId: target.collegeId, alias: source.name, source: "admin", move: true, actor });
  const repointed = await Registration.updateMany({ collegeId: source.collegeId }, { $set: { collegeId: target.collegeId, "collegeMatch.note": `Merged from ${source.collegeId}` } });
  await audit({ action: "college-merge", actor, collegeId: source.collegeId, before, after: { mergedInto: target.collegeId, aliasesMoved: movedAliases.modifiedCount, registrationsRepointed: repointed.modifiedCount, nameKeptAsAlias: !keptName.conflict } });
  invalidateCollegeIndex();
  return response.json({ message: `Merged ${source.name} into ${target.name}: ${repointed.modifiedCount} registration(s) re-pointed, ${movedAliases.modifiedCount} alias(es) moved.` });
};

// Admin decision for one registration: assign a college (optionally remembering the spelling as an alias),
// create a new college from it, or mark it unresolved. The submitted value is never changed.
export const resolveRegistrationCollege = async (request, response) => {
  const registration = mongoose.isValidObjectId(request.body.registrationId) ? await Registration.findById(request.body.registrationId) : null;
  if (!registration) return response.status(404).json({ message: "Registration not found." });
  const actor = actorOf(request);
  const raw = registration.collegeNameRaw ?? registration.college ?? "";
  let collegeId = clean(request.body.collegeId, 48) || null;

  if (request.body.createCollege) {
    const created = await createCollegeRecord({ name: clean(request.body.createCollege.name) || clean(raw), cities: request.body.createCollege.cities, actor });
    if (!created.college) return response.status(created.code).json({ message: created.message, collegeId: created.collegeId });
    collegeId = created.college.collegeId;
  }
  if (collegeId && !(await College.exists({ collegeId, active: true }))) return response.status(404).json({ message: "College not found." });
  if (collegeId && request.body.rememberAlias !== false && normalizeCollegeName(raw)) {
    const remembered = await addAliasTo({ collegeId, alias: raw, source: "review", move: request.body.move === true, actor });
    if (remembered.conflict) return response.status(409).json({ message: `"${raw}" is already an alias of ${remembered.conflict.collegeId || remembered.conflict.name}. Confirm to move it, or assign without remembering.`, conflict: remembered.conflict });
  }
  const before = { collegeId: registration.collegeId, collegeMatch: registration.collegeMatch?.toObject?.() || registration.collegeMatch };
  registration.collegeNameRaw = raw;
  registration.collegeId = collegeId;
  registration.collegeMatch = { method: collegeId ? "manual" : "none", confidence: collegeId ? 1 : 0, status: collegeId ? "confirmed" : "unresolved", candidates: registration.collegeMatch?.candidates || [], note: clean(request.body.note, 300), resolvedAt: new Date(), resolvedBy: actor };
  await registration.save();
  await audit({ action: "registration-resolve", actor, collegeId, registrationId: String(registration._id), teamId: registration.teamId, before, after: { collegeId, raw } });
  invalidateCollegeIndex();
  return response.json({ message: collegeId ? `${registration.teamId} assigned to ${collegeId}.` : `${registration.teamId} marked unresolved.` });
};

export const reprocessColleges = async (request, response) => {
  const summary = await reprocessRegistrations({ actor: actorOf(request), apply: request.body?.apply !== false });
  return response.json({ message: `Reprocessed ${summary.total} registrations: ${summary.changed} changed.`, ...summary, changes: summary.changes.slice(0, 100) });
};

export const getCollegeAudit = async (request, response) => {
  const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 50, 1), 200);
  const entries = await CollegeAudit.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  return response.json({ entries });
};

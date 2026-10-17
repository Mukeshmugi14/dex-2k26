// College name entity resolution — pure and deterministic (no database access), so it is fully unit-testable.
//
// buildCollegeIndex(colleges, aliases) prepares lookup tables once; matchCollege(raw, index) then resolves a
// submitted college name in this order, stopping at the first confident answer:
//   1. exact      — normalized input equals a college's canonical name
//   2. alias      — normalized input equals a verified alias
//   3. token-set  — same words in a different order ("Engineering College" = "College of Engineering")
//   4. location   — exact/alias/token-set match after removing city/area words ("…, OMR, Chennai")
//   5. fuzzy      — ranked similarity (typo-tolerant words + whole-string similarity); auto-accepted only when
//                   high, clearly ahead of the runner-up, and not contradicted by the city
// Anything else is "review" (has candidates for an admin) or "unresolved". Generic words such as "College",
// "Institute", "University" or "Technology" are never dropped, so similar-looking institutions are not merged.

export const THRESHOLDS = { auto: 0.9, margin: 0.08, review: 0.55, candidate: 0.4 };

// Conservative expansions only: unambiguous short forms of generic words, and "St"→"Saint" at the start.
const EXPANSIONS = { engg: "engineering", engineerng: "engineering", inst: "institute", instt: "institute", univ: "university", coll: "college", clg: "college", sci: "science", mgmt: "management" };
const STOPWORDS = new Set(["of", "the", "and", "at", "in", "for"]);
// City, area and campus words: evidence about location, not part of an institution's identity.
export const LOCATION_WORDS = new Set([
  "chennai", "madras", "omr", "semmancheri", "ramapuram", "kattankulathur", "ktr", "vadapalani", "tambaram", "chengalpattu",
  "kanchipuram", "kancheepuram", "mamallapuram", "mahabalipuram", "padur", "avadi", "poonamallee", "porur", "sholinganallur",
  "thoraipakkam", "vellore", "coimbatore", "madurai", "trichy", "tiruchirappalli", "salem", "nagpur", "bengaluru", "bangalore",
  "puducherry", "pondicherry", "thanjavur", "india", "tamilnadu", "tamil", "nadu", "tn", "campus", "off", "old", "road", "near",
]);

const editDistance = (a, b) => {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return row[b.length];
};
const ratio = (a, b) => (a.length || b.length ? 1 - editDistance(a, b) / Math.max(a.length, b.length) : 1);

/** Lower case, unified apostrophes/ampersands, punctuation removed, conservative abbreviation expansion. */
export const normalizeCollegeName = (raw) => {
  const words = String(raw ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/'s\b/g, "")          // possessive: "joseph's" → "joseph"
    .replace(/'/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.map((word, i) => {
    if (i === 0 && (word === "st" || word === "saint")) return "saint";
    const expanded = EXPANSIONS[word];
    return expanded || word;
  }).join(" ");
};

// A word is a location when it is in the list, or one typo away from a long one ("ramapauram" → ramapuram).
const isLocation = (word) => LOCATION_WORDS.has(word) || (word.length >= 7 && [...LOCATION_WORDS].some((loc) => loc.length >= 7 && editDistance(word, loc) <= 1));

/** Splits a normalized name into identity words (stopwords dropped) and location evidence. */
export const analyzeName = (normalized) => {
  const words = normalized.split(" ").filter(Boolean);
  const locations = words.filter(isLocation);
  const core = words.filter((w) => !STOPWORDS.has(w) && !isLocation(w));
  return { normalized, core, locations, tokenKey: [...core].sort().join(" "), coreKey: core.join(" ") };
};

/**
 * colleges: [{ collegeId, name, cities: [], active }]; aliases: [{ alias, collegeId, verified }].
 * Only active colleges and verified aliases take part in automatic matching.
 */
export const buildCollegeIndex = (colleges, aliases = []) => {
  const active = colleges.filter((c) => c.active !== false);
  const byId = new Map(active.map((c) => [c.collegeId, c]));
  const exact = new Map();      // normalized canonical name → collegeId
  const aliasMap = new Map();   // normalized verified alias → collegeId
  const tokenSet = new Map();   // sorted identity words → Set(collegeId)
  const forms = [];             // { collegeId, analysis, kind }
  const add = (collegeId, text, kind) => {
    const analysis = analyzeName(normalizeCollegeName(text));
    if (!analysis.normalized) return;
    if (kind === "canonical") exact.set(analysis.normalized, collegeId);
    if (kind === "alias" && !aliasMap.has(analysis.normalized)) aliasMap.set(analysis.normalized, collegeId);
    if (analysis.tokenKey) tokenSet.set(analysis.tokenKey, new Set([...(tokenSet.get(analysis.tokenKey) || []), collegeId]));
    forms.push({ collegeId, analysis, kind });
  };
  for (const college of active) add(college.collegeId, college.name, "canonical");
  for (const alias of aliases) if (alias.verified !== false && byId.has(alias.collegeId)) add(alias.collegeId, alias.alias, "alias");
  // Words used by exactly one college ("sathyabama", "srm"); a strong clue when generic words are excluded.
  const GENERIC = new Set(["college", "institute", "university", "engineering", "technology", "science", "sciences", "school", "academy", "research", "studies", "advanced", "advance", "education", "educational", "higher", "arts", "and", "saint", "dr", "of", "the"]);
  const owners = new Map();
  for (const f of forms) for (const w of f.analysis.core) if (!GENERIC.has(w) && w.length >= 3) owners.set(w, new Set([...(owners.get(w) || []), f.collegeId]));
  const uniqueWords = new Map([...owners].filter(([, ids]) => ids.size === 1).map(([w, ids]) => [w, [...ids][0]]));
  const cities = new Map(active.map((c) => [c.collegeId, new Set((c.cities || []).map((x) => normalizeCollegeName(x)).flatMap((x) => x.split(" ")).filter(Boolean))]));
  return { byId, exact, aliasMap, tokenSet, forms, uniqueWords, cities, size: active.length };
};

// Words match when equal, or one/two typos apart for longer words ("engieering" ~ "engineering").
const wordMatch = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && editDistance(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1));
const coverage = (from, to) => (from.length ? from.filter((w) => to.some((x) => wordMatch(w, x))).length / from.length : 0);

/** Similarity of two analyzed names in [0, 1], with precision/recall of their identity words. */
export const similarity = (input, form) => {
  const precision = coverage(input.core, form.core);
  const recall = coverage(form.core, input.core);
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const a = input.core.join(""), b = form.core.join("");
  // Whole-string similarity catches split/joined words ("veltech" vs "vel tech"); only meaningful for longer names.
  const compact = a.length >= 12 && b.length >= 12 ? ratio(a, b) : 0;
  const tokenScore = 0.75 * f1 + 0.25 * ratio(input.tokenKey, form.tokenKey);
  return { score: Math.max(tokenScore, compact >= 0.9 ? compact : 0), precision, recall };
};

// True when the input names a real place (not a generic word like "campus" or "road") that isn't one of the
// college's known cities/campuses. Unknown cities never conflict.
const GENERIC_PLACE = new Set(["india", "tamilnadu", "tamil", "nadu", "tn", "campus", "off", "old", "road", "near"]);
const cityConflicts = (index, collegeId, locations) => {
  const known = index.cities.get(collegeId);
  const places = locations.filter((l) => !GENERIC_PLACE.has(l));
  if (!places.length || !known?.size) return false;
  return !places.some((l) => known.has(l) || [...known].some((k) => k.length >= 7 && editDistance(k, l) <= 1));
};

const result = (fields) => ({ collegeId: null, method: "none", confidence: 0, status: "unresolved", candidates: [], locations: [], ...fields });

/** Resolves one submitted college name. Deterministic: same input + same index → same result. */
export const matchCollege = (raw, index) => {
  const normalized = normalizeCollegeName(raw);
  if (!normalized) return result({ status: "empty" });
  const input = analyzeName(normalized);
  const locations = input.locations;

  // 1–2. Exact canonical name or verified alias (full string, then without city/area words).
  if (index.exact.has(normalized)) return result({ collegeId: index.exact.get(normalized), method: "exact", confidence: 1, status: "matched", locations });
  if (index.aliasMap.has(normalized)) return result({ collegeId: index.aliasMap.get(normalized), method: "alias", confidence: 1, status: "matched", locations });
  // 3. Same identity words in another order.
  const sameWords = index.tokenSet.get(input.tokenKey);
  if (sameWords?.size === 1 && !input.locations.length) return result({ collegeId: [...sameWords][0], method: "token-set", confidence: 0.98, status: "matched", locations });
  // 4. Same after removing location words — unless the stated city contradicts the college's known cities.
  if (input.locations.length && input.core.length) {
    const core = input.core.join(" ");
    const id = index.exact.get(core) || index.aliasMap.get(core) || (sameWords?.size === 1 ? [...sameWords][0] : null);
    if (id && !cityConflicts(index, id, locations)) return result({ collegeId: id, method: "location", confidence: 0.96, status: "matched", locations });
    if (id) return result({ method: "location", confidence: 0.7, status: "review", candidates: [{ collegeId: id, name: index.byId.get(id)?.name || id, score: 0.7 }], locations, note: "The stated city doesn't match this college's known cities." });
  }

  // 5. Fuzzy ranking: best score per college over its canonical name and verified aliases.
  const best = new Map();
  for (const form of index.forms) {
    const s = similarity(input, form.analysis);
    const prev = best.get(form.collegeId);
    if (!prev || s.score > prev.score) best.set(form.collegeId, { collegeId: form.collegeId, ...s });
  }
  // A word that belongs to exactly one college is strong evidence, but only when most of the input agrees with it.
  for (const word of input.core) {
    const owner = index.uniqueWords.get(word);
    const entry = owner && best.get(owner);
    if (entry && entry.precision >= 0.6) entry.score = Math.max(entry.score, 0.9 + 0.05 * entry.precision);
  }
  // City evidence: a stated city/campus that doesn't fit the college lowers confidence and blocks auto-matching.
  for (const entry of best.values()) {
    entry.cityConflict = cityConflicts(index, entry.collegeId, locations);
    if (entry.cityConflict) entry.score -= 0.15;
  }
  const ranked = [...best.values()].filter((e) => e.score >= THRESHOLDS.candidate).sort((a, b) => b.score - a.score || a.collegeId.localeCompare(b.collegeId));
  const candidates = ranked.slice(0, 3).map((e) => ({ collegeId: e.collegeId, name: index.byId.get(e.collegeId)?.name || e.collegeId, score: Math.round(e.score * 1000) / 1000 }));
  const [top, second] = ranked;
  if (!top) return result({ status: "unresolved", locations });
  const margin = top.score - (second?.score || 0);
  const confidence = Math.round(Math.min(top.score, 0.99) * 1000) / 1000;
  if (top.score >= THRESHOLDS.auto && margin >= THRESHOLDS.margin && top.precision >= 0.6 && !top.cityConflict) {
    return result({ collegeId: top.collegeId, method: "fuzzy", confidence, status: "matched", candidates, locations });
  }
  if (top.score >= THRESHOLDS.review) return result({ method: "fuzzy", confidence, status: "review", candidates, locations });
  return result({ status: "unresolved", candidates, locations });
};

// Groups the many ways one college gets typed ("SIST", "Sathyabama University", "St.Joseph College Of Engineering,OMR",
// "St josephs college of engieering", ...) under one standard name, for analytics, filters and exports.
//
// 1. Known colleges: alias rules map short names, nicknames and common typos to an official name.
// 2. Everything else: a "token key" ignores case, punctuation, word order, filler words, possessives,
//    city/area names and "St"/"Saint"; spellings whose keys are near-identical (a typo or one extra word
//    like a city) are merged, and the most common spelling becomes the display name.
// Distinct institutions that share a word (SIMATS vs Saveetha Engineering College, Vel Tech vs Vels,
// RMD vs RMK, Dhanalakshmi vs Dhanalakshmi Srinivasan) are kept apart on purpose.

const lower = (value) => String(value || "").toLowerCase();
// Letters only, so "St.Joseph's", "st josephs" and "ST JOSEPH'S" compare equal.
const squash = (value) => lower(value).replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Order matters: more specific rules first. Each rule tests the squashed name (lower case, single spaces).
const ALIASES = [
  { name: "Sathyabama Institute of Science and Technology", test: (s) => /\bsathya ?bama\b/.test(s) || /^sist\b|\bsist$|\(sist\)/.test(s) || /\bsathyabama/.test(s.replace(/ /g, "")) },
  { name: "SIMATS (Saveetha Institute of Medical and Technical Sciences)", test: (s) => /\bsimats\b/.test(s) || /saveetha institute of medical/.test(s) },
  { name: "Saveetha Engineering College", test: (s) => /\bsaveetha\b/.test(s) && /engineering/.test(s) },
  { name: "St. Joseph's College of Engineering and Technology", test: (s) => /\bjo[se]{2}ph/.test(s) && /\bcollege\b/.test(s) && /\bengineering\b/.test(s) && /\btechnology\b/.test(s) },
  { name: "St. Joseph's Institute of Technology", test: (s) => /\bjo[se]{2}ph/.test(s) && /institute of technology/.test(s) },
  { name: "St. Joseph's College of Engineering", test: (s) => /\bjo[se]{2}ph/.test(s) && /\bengi?e?n?e?e?ring\b|\bengg\b|\bengieering\b|\bengineering\b/.test(s) },
  { name: "SRM Institute of Science and Technology", test: (s) => /\bsrm\b|\bsrmist\b/.test(s) },
  { name: "Panimalar Engineering College", test: (s) => /\bpanimalar\b/.test(s) },
  { name: "Dhanalakshmi Srinivasan College of Engineering and Technology", test: (s) => /\bdhanalakshmi srinivasan\b|\bdscet\b/.test(s) },
  { name: "Dhanalakshmi College of Engineering", test: (s) => /\bdhanalakshmi\b/.test(s) },
  { name: "Vel Tech High Tech Dr. Rangarajan Dr. Sakunthala Engineering College", test: (s) => /\bvel ?tech\b/.test(s) && /\bhigh ?tech\b/.test(s) },
  { name: "Vel Tech University (Vel Tech Rangarajan Dr. Sagunthala R&D Institute)", test: (s) => /\bvel ?tech\b|\bveltech\b/.test(s) },
  { name: "Vels Institute of Science, Technology & Advanced Studies (VISTAS)", test: (s) => /\bvels\b|\bvistas\b/.test(s) },
  { name: "RMD Engineering College", test: (s) => /\brmd\b|\br m d\b/.test(s) },
  { name: "RMK College of Engineering and Technology", test: (s) => /\brmk\b|\br m k\b/.test(s) && /technology/.test(s) && !/\brmk engineering\b|\br m k engineering\b/.test(s) },
  { name: "R.M.K. Engineering College", test: (s) => /\brmk\b|\br m k\b/.test(s) },
  { name: "VIT (Vellore Institute of Technology)", test: (s) => /^vit\b|\bvit\b|vellore institute of technology/.test(s) },
  { name: "IIITDM Kancheepuram", test: (s) => /\biiitdm\b/.test(s) },
  { name: "YCCE (Yeshwantrao Chavan College of Engineering)", test: (s) => /^ycce\b|yeshwantrao chavan/.test(s) },
  { name: "Dr. M.G.R. Educational and Research Institute", test: (s) => /\bmgr\b|\bm g r\b/.test(s) && /(educational|research|university)/.test(s) },
  { name: "B.S. Abdur Rahman Crescent Institute of Science and Technology", test: (s) => /\bcrescent\b/.test(s) },
  { name: "Bharath Institute of Higher Education and Research (Bharath University)", test: (s) => /\bbharath (university|institute)\b|\bbiher\b/.test(s) },
  { name: "Anna University", test: (s) => /^anna university\b|\bceg\b|college of engineering guindy/.test(s) },
  { name: "SSN College of Engineering", test: (s) => /\bssn\b/.test(s) },
];

// Words that don't tell colleges apart, plus city/area names that people add or leave out.
const FILLER = new Set(["of", "the", "and", "for", "in", "at", "off", "road", "near",
  "chennai", "madras", "omr", "old", "mahabalipuram", "semmancheri", "ramapuram", "kattankulathur", "vadapalani", "tambaram",
  "chengalpattu", "kanchipuram", "kancheepuram", "mamallapuram", "padur", "avadi", "poonamallee", "porur", "thoraipakkam", "sholinganallur",
  "tamilnadu", "tamil", "nadu", "tn", "india", "campus"]);
const EXPAND = { st: "saint", engg: "engineering", eng: "engineering", inst: "institute", tech: "technology", univ: "university", coll: "college", clg: "college", sci: "science", mgmt: "management" };

const tokensOf = (raw) => squash(raw).split(" ")
  .map((word) => EXPAND[word] || word)
  .filter((word) => word && !FILLER.has(word))
  .map((word) => (word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));

const editDistance = (a, b) => {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return row[b.length];
};
// Two words match when equal or, for longer words, one typo apart ("engieering" ~ "engineering").
const wordsMatch = (a, b) => a === b || (a.length >= 6 && b.length >= 6 && editDistance(a, b) <= 2);
// Same college when every word of the shorter name appears in the longer one and they differ by at most one word.
const sameTokens = (a, b) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!short.length || long.length - short.length > 1) return false;
  return short.every((word) => long.some((other) => wordsMatch(word, other)));
};

export const aliasFor = (raw) => {
  const s = squash(raw);
  if (!s) return null;
  return ALIASES.find((alias) => alias.test(s))?.name || null;
};

// Readable title case for a spelling typed in ALL CAPS or all lower case; short all-caps words stay acronyms.
const SMALL = new Set(["of", "and", "the", "for", "in", "at"]);
const prettify = (raw) => {
  const text = String(raw || "").trim().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
  if (text !== text.toUpperCase() && text !== text.toLowerCase()) return text;
  return text.split(" ").map((word, i) => {
    if (/^[A-Z]{2,5}$/.test(word) && text === text.toUpperCase() && !/^(OF|AND|THE|FOR)$/.test(word)) return word;
    const w = word.toLowerCase();
    return i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
};

/**
 * Builds a resolver over every spelling seen, so near-identical unknown spellings can be merged with each other.
 * resolve(raw) → { name, key }; name is "" for an empty college. groups() lists each standard name with its spellings.
 */
export const createCollegeResolver = (spellings) => {
  const groups = []; // { name, key, tokens, spellings: Map(spelling → count), alias }
  const bySpelling = new Map();
  const add = (raw) => {
    const spelling = String(raw || "").trim();
    if (!spelling || bySpelling.has(spelling)) return;
    const alias = aliasFor(spelling);
    const tokens = tokensOf(spelling);
    let group = alias ? groups.find((g) => g.alias === alias) : groups.find((g) => !g.alias && sameTokens(g.tokens, tokens));
    if (!group) {
      group = { alias, key: alias ? `alias:${alias}` : `tokens:${[...tokens].sort().join(" ")}`, tokens, spellings: new Map() };
      groups.push(group);
    }
    bySpelling.set(spelling, group);
  };
  for (const raw of spellings) add(raw);
  const count = (raw) => { const s = String(raw || "").trim(); const g = bySpelling.get(s); if (g) g.spellings.set(s, (g.spellings.get(s) || 0) + 1); };
  for (const raw of spellings) count(raw);
  for (const g of groups) {
    const common = [...g.spellings.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] || "";
    g.name = g.alias || prettify(common);
  }
  return {
    resolve: (raw) => {
      const spelling = String(raw || "").trim();
      if (!spelling) return { name: "", key: "" };
      if (!bySpelling.has(spelling)) { add(spelling); const g = bySpelling.get(spelling); g.name = g.name || g.alias || prettify(spelling); }
      const g = bySpelling.get(spelling);
      return { name: g.name, key: g.key };
    },
    groups: () => groups.map((g) => ({ name: g.name, key: g.key, spellings: [...g.spellings.keys()] })).sort((a, b) => a.name.localeCompare(b.name)),
  };
};

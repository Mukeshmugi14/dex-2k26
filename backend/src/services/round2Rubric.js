// DEXATHON 2K26 Round 2 prototype evaluation (rubric DEX2K26-PROTO v1.0). Each prototype is scored on the four
// criteria of its own type: SOFTWARE or HARDWARE. Either may be a website, Google Drive or YouTube link.
// Levels 0–5 per criterion; Marks = Max × Level ÷ 5; Total = sum of the four criteria (100).
export const ROUND2_RUBRIC_VERSION = "DEX2K26-PROTO v1.0";

export const ROUND2_CRITERIA = {
  SOFTWARE: [
    { id: "S1", name: "Working functionality", max: 30, check: "Core features work end-to-end in the live link; no blocking errors or dead ends",
      level5: "Every core feature claimed in Round 1 works live, end-to-end, with realistic input; errors are handled gracefully",
      level3: "Main flow works but some features are missing, mocked or break on common input" },
    { id: "S2", name: "Technical implementation", max: 25, check: "Sound architecture, real data handling and integrations (APIs, database, AI/ML only if used)",
      level5: "Real back-end / data layer and integrations visibly working; sensible stack; performs reliably",
      level3: "Mostly front-end or hard-coded data; limited integration; works but fragile" },
    { id: "S3", name: "UI / UX & usability", max: 20, check: "Clear navigation, responsive layout, accessible and consistent design",
      level5: "A first-time user can complete the main task unaided; responsive on mobile and desktop; consistent and accessible",
      level3: "Usable with some confusion; layout issues on some screens" },
    { id: "S4", name: "Innovation, problem fit & impact", max: 25, check: "Solves the Round 1 problem; what is new; real-world value and adoption potential",
      level5: "Clearly solves the stated problem with a distinctive approach; credible path to real users",
      level3: "Addresses the problem in a familiar way; value asserted more than shown" },
  ],
  HARDWARE: [
    { id: "H1", name: "Working prototype demonstration", max: 30, check: "The device works in the video: real, live operation (not simulation or slides)",
      level5: "Complete physical prototype demonstrated live doing its core function reliably, start to finish",
      level3: "Partial prototype or only some functions shown working; parts simulated or explained" },
    { id: "H2", name: "Hardware design & integration", max: 25, check: "Sensors / actuators / controller / power integrated; build quality and reliability",
      level5: "All components integrated cleanly with a clear circuit and data flow; robust, safe build",
      level3: "Components work individually but integration is loose (breadboard, frequent fixes)" },
    { id: "H3", name: "Demo video clarity", max: 20, check: "Video explains the problem, components and setup, and shows real results clearly",
      level5: "Clear, well-structured video: problem, parts, live demo and results all easy to follow",
      level3: "Demo understandable but rushed, unclear audio/visuals, or key steps not shown" },
    { id: "H4", name: "Innovation, feasibility & impact", max: 25, check: "Novelty, cost and scalability, safety, and real-world value",
      level5: "Distinctive solution with realistic cost / scaling plan and clear real-world benefit",
      level3: "Known approach; feasibility or cost not considered" },
  ],
};

export const ROUND2_LEVELS = [
  { level: 5, label: "Excellent", meaning: "Fully demonstrated with clear, checkable evidence" },
  { level: 4, label: "Very Good", meaning: "Meets the criterion; one element missing or thin" },
  { level: 3, label: "Good", meaning: "Core present; important details missing" },
  { level: 2, label: "Needs Improvement", meaning: "Mostly claimed, little shown" },
  { level: 1, label: "Poor", meaning: "Minimal evidence" },
  { level: 0, label: "Not Demonstrated", meaning: "Not shown / link or video not working" },
];
export const ROUND2_RECOMMENDATIONS = ["Strongly recommend for Final", "Recommend for Final", "Borderline – discuss", "Not recommended"];
export const ROUND2_FLAGS = ["Link / video not working", "Not the team's own work", "Doesn't match Round 1 idea", "Other"];
export const ROUND2_RULES = [
  "Score only what the prototype link or video shows; don't add credit for features that are only described.",
  "If the link or video doesn't open, score H1/S1 as 0, tick the flag and tell the organisers.",
  "Marks = Max × Level ÷ 5 per criterion; Total = sum of the 4 criteria (max 100). Whole levels only (0–5).",
  "If torn between two levels, choose the lower one unless you can point to evidence for the higher one.",
];

const round1 = (v) => Math.round(v * 10) / 10;
export const round2CriteriaFor = (category) => ROUND2_CRITERIA[category] || null;
export const round2TotalFor = (category, levels = {}) => round1((round2CriteriaFor(category) || []).reduce((s, c) => s + (Number.isInteger(levels[c.id]) ? (c.max * levels[c.id]) / 5 : 0), 0));

/** Cleans an evaluator's Round 2 sheet; with submit=true every criterion, a recommendation and the declaration are required. */
export const cleanRound2Sheet = (body = {}, category, { submit = false } = {}) => {
  const criteria = round2CriteriaFor(category);
  const errors = {};
  if (!criteria) return { value: null, errors: { category: "This team has no prototype type." } };
  const levels = {};
  for (const c of criteria) {
    const raw = body.levels?.[c.id];
    if (raw !== undefined && raw !== null && raw !== "") {
      const level = Number(raw);
      if (!Number.isInteger(level) || level < 0 || level > 5) errors[`level.${c.id}`] = "Choose a level from 0 to 5.";
      else levels[c.id] = level;
    }
    if (submit && levels[c.id] === undefined) errors[`level.${c.id}`] ||= "Choose a level.";
  }
  const value = {
    category,
    levels,
    flags: Array.isArray(body.flags) ? [...new Set(body.flags.filter((f) => ROUND2_FLAGS.includes(f)))] : [],
    remarks: typeof body.remarks === "string" ? body.remarks.trim().slice(0, 600) : "",
    recommendation: ROUND2_RECOMMENDATIONS.includes(body.recommendation) ? body.recommendation : "",
    coiDeclared: body.coiDeclared === true,
  };
  if (submit) {
    if (!value.recommendation) errors.recommendation = "Choose a recommendation.";
    if (!value.coiDeclared) errors.coiDeclared = "Confirm you have no conflict of interest with this team.";
  }
  value.total = round2TotalFor(category, levels);
  return { value, errors };
};

export const round2RubricView = () => ({ version: ROUND2_RUBRIC_VERSION, criteria: ROUND2_CRITERIA, levels: ROUND2_LEVELS, recommendations: ROUND2_RECOMMENDATIONS, flags: ROUND2_FLAGS, rules: ROUND2_RULES, totalMax: 100 });

// DEXATHON 2K26 PPT Evaluation Sheet (rubric DEX2K26-PPT v1.0): 11 criteria, total 100.
// Marks = Max × Level ÷ 5 per criterion (whole levels 0–5); Total = sum of the 11 criteria.
// The evaluator portal and the admin page both read this, so the paper sheet and the online scores always agree.
export const RUBRIC_VERSION = "DEX2K26-PPT v1.0";

export const CRITERIA = [
  { id: "C1", name: "Template compliance and completeness", max: 8, slides: "All", check: "All required slides in order; title fields; sub-sections answered; branding kept",
    level5: "All required slides in order, all title fields, every sub-section answered, branding intact; at most one trivial slip",
    level3: "One required slide missing or merged so its section is hard to find, OR 2–3 sub-sections missing" },
  { id: "C2", name: "Problem definition and significance", max: 12, slides: "2 (+4)", check: "Specific problem, affected users, gap, evidence of significance",
    level5: "Specific problem and users; gap stated; significance backed by at least one verifiable, quantified source relevant to the target context",
    level3: "Understandable but generic, or users/gap unclear; little evidence" },
  { id: "C3", name: "Solution clarity and problem-solution fit", max: 12, slides: "2, 3", check: "Product in one sentence; features map to problem; prototype scope defined",
    level5: "Clear product; every core feature traced to the problem; prototype scope with inputs, outputs and user workflow",
    level3: "Product understandable; fit asserted not shown; prototype vague" },
  { id: "C4", name: "Innovation and differentiation", max: 10, slides: "2, 5, 7", check: "What is new; named alternatives; why the difference matters",
    level5: "Clearly novel element with user value; alternatives named; difference explained and credible",
    level3: "Known approach with modest stated twist, OR novel claim with weak comparison" },
  { id: "C5", name: "Technical approach and architecture", max: 15, slides: "3", check: "Components + data flow; fitting, justified stack; AI/ML specified only if used",
    level5: "Component-level architecture with data flow and decision/error paths; stack fits and is justified; AI/ML specified or non-AI approach clearly fits; hardest parts identified",
    level3: "Generic block diagram or technology list; key mechanism not explained" },
  { id: "C6", name: "Feasibility, scope and risk", max: 12, slides: "4", check: "In/out of scope realistic for 24 h; data source; risks + mitigations; cost",
    level5: "Explicit realistic scope with in/out; data source named; at least 3 relevant risks with specific mitigations; dependencies and cost acknowledged",
    level3: "Feasibility asserted generally; few risks; generic mitigations" },
  { id: "C7", name: "Validation plan and success metrics", max: 8, slides: "3, 4, 6", check: "Metrics with targets; test data; baseline; demo scenario",
    level5: "At least 2 measurable metrics with targets, defined test data, baseline/comparison and demo scenario",
    level3: "Metrics without targets or data; or demo plan only" },
  { id: "C8", name: "Impact, viability and adoption", max: 8, slides: "5, 6", check: "Beneficiaries; measurable impact; first pilot / adoption path; coherent model",
    level5: "Specific beneficiaries, measurable impact indicators, realistic adoption path with first pilot, coherent model",
    level3: "Generic benefits; generic canvas" },
  { id: "C9", name: "Research and references", max: 5, slides: "7 + in-text", check: "Credible sources; claims attributed; contribution stated",
    level5: "At least 3 credible relevant sources; key claims attributed in-text; contribution stated; own artefacts labelled",
    level3: "Mostly tool docs or generic; weak link to claims" },
  { id: "C10", name: "Content quality, coherence and consistency", max: 5, slides: "All", check: "Logical flow; slides agree with each other; precise wording",
    level5: "Logical flow, no contradictions, precise, at most 2 minor typos",
    level3: "One significant contradiction or many vague claims" },
  { id: "C11", name: "Visual communication and readability", max: 5, slides: "All", check: "Legible at projection size; diagrams explain; consistent hierarchy",
    level5: "All text and diagrams legible; at least one diagram explains a key mechanism; consistent",
    level3: "A key diagram or slide hard to read, or crowded" },
];

export const LEVELS = [
  { level: 5, label: "Excellent", meaning: "Every element present with specific, checkable evidence" },
  { level: 4, label: "Very Good", meaning: "Meets the criterion; exactly one element missing or thin" },
  { level: 3, label: "Good", meaning: "Core present; two or more important details missing" },
  { level: 2, label: "Needs Improvement", meaning: "Mostly assertion; significant weaknesses" },
  { level: 1, label: "Poor", meaning: "Minimal evidence" },
  { level: 0, label: "Not Demonstrated", meaning: "Evidence absent or unverifiable (not proof of impossibility)" },
];

export const SUBMISSION_CHECKS = [
  { id: "fileOpens", label: "File opens" },
  { id: "teamIdMatches", label: "Team ID matches" },
  { id: "officialTemplate", label: "Official template used" },
  { id: "allSlides", label: "All 7 required slides" },
];
export const POLICY_FLAGS = ["Late", "Suspected plagiarism / reuse", "Slide limit exceeded", "Conflict of interest", "Other"];
export const RECOMMENDATIONS = ["Strongly recommend", "Recommend", "Borderline – discuss", "Not recommended", "Refer for policy review"];
export const PS_CATEGORIES = ["Software", "Hardware"];

export const SCORING_RULES = [
  "Marks = Max × Level ÷ 5 per criterion; Total = sum of 11 criteria (max 100). Whole levels only (0–5).",
  "Pick the highest level whose descriptor is fully met. If torn, choose the lower level unless you can write the evidence for the higher one.",
  "Evidence only: score what is on the slides. Do not add credit from your own domain knowledge or deduct for what the team \"probably\" cannot do.",
  "Deduct once: each weakness is penalised in one criterion only. Contradictions between slides → C10 only; in C5–C7 score the more conservative statement.",
  "Missing slide: lower C1 per its descriptor. Score other criteria from evidence anywhere in the deck; score 0 only where no evidence exists at all.",
  "Incomplete submission (some slides blank or placeholder): score as submitted; blank content earns 0 in its criterion and lowers C1.",
  "Unclear or illegible evidence: credit only what can be read at normal viewing size; note \"illegible\" in the comment. Do not guess content.",
  "0 = not demonstrated, never \"technically impossible\". A low feasibility score must cite what was missing.",
  "No bonus for AI/ML, cloud, number of tools or visual polish. A clear non-AI solution can score full marks.",
  "Policy matters (late, plagiarism, wrong team ID, unreadable file, slide limit) are decided by organisers, not by marks. Tick the policy flag and keep scoring.",
];

const round1 = (value) => Math.round(value * 10) / 10;
export const marksFor = (criterion, level) => round1((criterion.max * level) / 5);
// Evidence comments are no longer collected on the online sheet (organisers' choice), so none is required.
export const commentRequired = () => false;

/** Total of the levels given so far (missing levels count 0). */
export const totalFor = (levels = {}) => round1(CRITERIA.reduce((sum, c) => sum + (Number.isInteger(levels[c.id]) ? marksFor(c, levels[c.id]) : 0), 0));

const text = (value, max = 1000) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * Cleans an evaluator's sheet. With submit=true every rule of the paper sheet is enforced:
 * all 11 levels, a recommendation and the conflict-of-interest declaration.
 * Returns { value, errors } (errors keyed by field, empty when valid).
 */
export const cleanSheet = (body = {}, { submit = false } = {}) => {
  const errors = {};
  const levels = {}, comments = {};
  for (const c of CRITERIA) {
    const raw = body.levels?.[c.id];
    if (raw !== undefined && raw !== null && raw !== "") {
      const level = Number(raw);
      if (!Number.isInteger(level) || level < 0 || level > 5) errors[`level.${c.id}`] = "Choose a level from 0 to 5.";
      else levels[c.id] = level;
    }
    comments[c.id] = text(body.comments?.[c.id], 1000);
    if (submit && levels[c.id] === undefined) errors[`level.${c.id}`] ||= "Choose a level.";
  }
  const checks = Object.fromEntries(SUBMISSION_CHECKS.map((ch) => [ch.id, body.checks?.[ch.id] === true]));
  checks.missingSlides = text(body.checks?.missingSlides, 200);
  const policyFlags = Array.isArray(body.policyFlags) ? [...new Set(body.policyFlags.filter((f) => POLICY_FLAGS.includes(f)))] : [];
  const list = (values) => (Array.isArray(values) ? values : []).slice(0, 3).map((v) => text(v, 400));
  const value = {
    projectTitle: text(body.projectTitle, 200),
    psCategory: PS_CATEGORIES.includes(body.psCategory) ? body.psCategory : "",
    panel: text(body.panel, 100),
    checks,
    policyFlags,
    policyNote: text(body.policyNote, 400),
    levels,
    comments,
    strengths: list(body.strengths),
    improvements: list(body.improvements),
    recommendation: RECOMMENDATIONS.includes(body.recommendation) ? body.recommendation : "",
    coiDeclared: body.coiDeclared === true,
  };
  if (submit) {
    if (!value.recommendation) errors.recommendation = "Choose an overall recommendation.";
    if (!value.coiDeclared) errors.coiDeclared = "Confirm you have no conflict of interest with this team.";
  }
  value.total = totalFor(levels);
  return { value, errors };
};

export const rubricView = () => ({ version: RUBRIC_VERSION, criteria: CRITERIA, levels: LEVELS, submissionChecks: SUBMISSION_CHECKS, policyFlags: POLICY_FLAGS, recommendations: RECOMMENDATIONS, psCategories: PS_CATEGORIES, rules: SCORING_RULES, totalMax: 100 });

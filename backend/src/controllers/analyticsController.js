import mongoose from "mongoose";
import Admin from "../models/Admin.js";
import Registration from "../models/Registration.js";
import { createCollegeResolver } from "../services/collegeNames.js";

// Admin → Analytics: every figure is computed here from the live registrations, so the page only draws them.
const IST_OFFSET = 5.5 * 3600 * 1000;
const HOST_COLLEGE = "Sathyabama Institute of Science and Technology";
const istDay = (date) => new Date(new Date(date).getTime() + IST_OFFSET).toISOString().slice(0, 10);
const norm = (value) => String(value || "").trim().toLowerCase();
const tidy = (value) => String(value || "").trim().replace(/\s+/g, " ");
const digits = (value) => String(value || "").replace(/\D/g, "");
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
// Common typos in Team Head emails (e.g. "@gmail.co", "@gmial.com") that would stop the login email arriving.
const looksMistyped = (value) => /@(gmail|gmial|gamil|gnail)\.(?!com$)[a-z]+$|@(gmial|gamil|gnail|gmai)\.com$/i.test(String(value || "").trim());

const countBy = (items, keyOf) => {
  const counts = new Map();
  for (const item of items) { const key = keyOf(item); if (key === null || key === undefined) continue; counts.set(key, (counts.get(key) || 0) + 1); }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
};
// Top N rows, the rest folded into one "Other (k …)" row so a chart never shows dozens of thin bars.
const topWithOther = (rows, n, noun) => {
  if (rows.length <= n + 1) return rows;
  const rest = rows.slice(n);
  return [...rows.slice(0, n), { label: `Other (${rest.length} ${noun})`, count: rest.reduce((s, r) => s + r.count, 0), other: true }];
};

// People in a team: members, plus the Team Head when they aren't also listed as a member.
const peopleOf = (team) => {
  const head = norm(team.leader?.email);
  const members = (team.members || []).filter((m) => tidy(m?.name) || norm(m?.email));
  const headListed = members.some((m) => norm(m.email) && norm(m.email) === head) || members.some((m) => norm(m.name) && norm(m.name) === norm(team.leader?.name));
  if (headListed || !(team.leader?.name || head)) return members;
  return [{ name: team.leader?.name, email: team.leader?.email, phone: team.leader?.phone, year: team.year, department: team.department, college: "" }, ...members];
};

// "III", "3rd yr", "Third Year", "3" → "3rd year"; postgraduate kept apart.
const yearOf = (raw) => {
  const s = norm(raw).replace(/\s+/g, " ");
  if (!s) return null;
  if (/\b(pg|m\.?e|m\.?tech|mca|mba|m\.?sc|post ?grad)\b/.test(s)) return "Postgraduate";
  const map = [[/\b(1|1st|i|first|fresh)/, "1st year"], [/\b(2|2nd|ii|second)/, "2nd year"], [/\b(3|3rd|iii|third)/, "3rd year"], [/\b(4|4th|iv|fourth|final)/, "4th year"]];
  for (const [re, label] of map) if (re.test(s)) return label;
  return "Other";
};

// Department spellings grouped into common names (specific ones first).
const DEPARTMENTS = [
  [/artificial intelligence.*data|ai ?(&|and)? ?ds\b|\baids\b|ai-ds/, "AI & Data Science"],
  [/artificial intelligence.*machine|ai ?(&|and)? ?ml\b|\baiml\b/, "AI & Machine Learning"],
  [/cyber/, "Cyber Security"],
  [/\bcsbs\b|business systems/, "CS & Business Systems"],
  [/\bcse\b|computer science|\bcs\b|c\.s\.e/, "Computer Science (CSE)"],
  [/\bit\b|information technology/, "Information Technology"],
  [/\bece\b|electronics (and|&) comm/, "Electronics & Communication"],
  [/\beee\b|electrical/, "Electrical & Electronics"],
  [/\bmech|mechanical|robotics|mechatronics/, "Mechanical / Robotics"],
  [/\bbme\b|biomedical|bio medical/, "Biomedical"],
  [/\bmca\b|\bbca\b|computer applications/, "Computer Applications (MCA/BCA)"],
  [/\bcivil\b/, "Civil"],
  [/biotech/, "Biotechnology"],
];
const departmentOf = (raw) => {
  const s = norm(raw);
  if (!s) return null;
  return DEPARTMENTS.find(([re]) => re.test(s))?.[1] || "Other (not in the list)";
};

const teamRef = (team) => ({ teamId: team.teamId || "", teamName: team.teamName || "", email: team.leader?.email || "" });

export const getAnalytics = async (_request, response) => {
  const teams = await Registration.find({}).lean();
  const total = teams.length;
  // Every spelling of a college ("SIST", "Sathyabama University", …) counts as one standard college.
  const colleges = createCollegeResolver(teams.flatMap((t) => [t.college || t.collegeName, ...(t.members || []).map((m) => m.college)]));
  const collegeOfTeam = (t) => colleges.resolve(t.college || t.collegeName).name;
  const everyone = teams.flatMap((t) => peopleOf(t).map((p) => ({ ...p, team: t, college: colleges.resolve(p.college || t.college || t.collegeName).name })));

  const teamsByCollege = countBy(teams, (t) => collegeOfTeam(t) || "Not given");
  const peopleByCollege = countBy(everyone, (p) => p.college || "Not given");
  const collegeCount = teamsByCollege.filter((c) => c.label !== "Not given").length;
  const hostTeams = teams.filter((t) => collegeOfTeam(t) === HOST_COLLEGE).length;
  const hostPeople = everyone.filter((p) => p.college === HOST_COLLEGE).length;
  const mixedTeams = teams.filter((t) => new Set(peopleOf(t).map((p) => colleges.resolve(p.college || t.college || t.collegeName).name).filter(Boolean)).size > 1);

  // Registrations per IST day, with no gaps between the first and the last day.
  const perDay = new Map(countBy(teams.filter((t) => t.createdAt), (t) => istDay(t.createdAt)).map(({ label, count }) => [label, count]));
  const days = [...perDay.keys()].sort();
  const registrations = [];
  if (days.length) {
    // Day strings are IST calendar days; stepping a UTC midnight by 24 h walks them one by one.
    for (let d = new Date(`${days[0]}T00:00:00Z`); d.toISOString().slice(0, 10) <= days.at(-1); d = new Date(d.getTime() + 86400000)) {
      const day = d.toISOString().slice(0, 10);
      registrations.push({ label: day, count: perDay.get(day) || 0 });
    }
  }
  let running = 0;
  registrations.forEach((r) => { running += r.count; r.total = running; });

  const people = everyone.length;
  const emailed = teams.filter((t) => t.registrationEmail?.status === "Sent").length;
  const pdf = teams.filter((t) => t.pdfSubmission?.fileId).length;
  const prototypes = teams.filter((t) => t.prototypeSubmission?.url);
  const round1Selected = teams.filter((t) => ["SELECTED", "COMPLETED"].includes(t.rounds?.round1)).length;
  const membersListed = teams.filter((t) => (t.members || []).length).length;

  // Member profile completeness (each person counted once).
  const completeness = [
    { label: "Phone number", count: everyone.filter((p) => digits(p.phone).length >= 10).length },
    { label: "Email address", count: everyone.filter((p) => isEmail(p.email)).length },
    { label: "Year of study", count: everyone.filter((p) => tidy(p.year) || tidy(p.team.year)).length },
    { label: "Department", count: everyone.filter((p) => tidy(p.department) || tidy(p.team.department)).length },
  ];
  const completeTeams = teams.filter((t) => peopleOf(t).length && peopleOf(t).every((p) => digits(p.phone).length >= 10 && isEmail(p.email))).length;

  // Theme × college (top 6 colleges by teams): which themes each college chose.
  const themeNames = countBy(teams, (t) => t.projectTheme || "Not selected").map((t) => t.label);
  const topCollegeNames = teamsByCollege.filter((c) => c.label !== "Not given").slice(0, 6).map((c) => c.label);
  const themeByCollege = {
    themes: themeNames,
    rows: topCollegeNames.map((college) => ({ college, counts: themeNames.map((theme) => teams.filter((t) => collegeOfTeam(t) === college && (t.projectTheme || "Not selected") === theme).length) })),
  };

  // Things an admin should fix, each with the teams concerned.
  const issue = (key, title, detail, list) => ({ key, title, detail, count: list.length, teams: list.map(teamRef) });
  const health = [
    issue("no-members", "No members recorded", "These teams can add members themselves in the Team Portal until 26 Oct.", teams.filter((t) => !(t.members || []).length)),
    issue("placeholder-name", "Placeholder team name", 'Names like "Team 17" or "Team <name>" from the recovery; replace with the real team name.', teams.filter((t) => /^team(\s|$)/i.test(tidy(t.teamName)) && t.importSource === "RECOVERY")),
    issue("email-not-sent", "Registration email not sent", "Send the login email from Team Lists.", teams.filter((t) => t.registrationEmail?.status !== "Sent")),
    issue("email-failed", "Registration email failed", "Check the Team Head email and resend.", teams.filter((t) => t.registrationEmail?.status === "Failed")),
    issue("email-typo", "Team Head email looks mistyped", "The login email may not arrive (e.g. @gmail.co).", teams.filter((t) => !isEmail(t.leader?.email) || looksMistyped(t.leader?.email))),
    issue("no-phone", "No Team Head phone", "Add a phone number so the team can be reached.", teams.filter((t) => digits(t.leader?.phone).length < 10)),
    issue("no-college", "No college", "College is missing.", teams.filter((t) => !tidy(t.college || t.collegeName))),
    issue("college-unclear", "College entry mixes several colleges", 'The college field names more than one college (e.g. "Member 1–5: … and Member 6: …").', teams.filter((t) => /member\s*\d|\band\s+team\s+member/i.test(String(t.college || "")))),
    issue("no-theme", "No project theme", "The team hasn't chosen a theme yet.", teams.filter((t) => !t.projectTheme)),
  ].filter((i) => i.count);

  // Security: admin accounts and current lockouts (no passwords or codes ever leave the server).
  const admins = (await Admin.find({}, "username name role active lastLoginAt").sort({ active: -1, lastLoginAt: -1 }).lean())
    .map((a) => ({ username: a.username, name: a.name || "", role: a.role, active: a.active !== false, lastLoginAt: a.lastLoginAt || null }));
  const throttles = await mongoose.connection.db.collection("loginthrottles").find({}, { projection: { key: 1, failures: 1, lockedUntil: 1 } }).toArray().catch(() => []);
  const now = Date.now();
  const security = {
    admins,
    activeAdmins: admins.filter((a) => a.active).length,
    lockedNow: throttles.filter((t) => t.lockedUntil && new Date(t.lockedUntil).getTime() > now).map((t) => ({ key: t.key, minutes: Math.ceil((new Date(t.lockedUntil).getTime() - now) / 60000) })),
    recentFailures: throttles.reduce((sum, t) => sum + (t.failures || 0), 0),
  };

  return response.json({
    generatedAt: new Date(),
    totals: { teams: total, people, colleges: collegeCount, emailed, pdf, prototype: prototypes.length, round1Selected, hostTeams, hostPeople, mixedTeams: mixedTeams.length, completeTeams, avgSize: total ? people / total : 0 },
    registrations,
    themes: countBy(teams, (t) => t.projectTheme || "Not selected"),
    colleges: topWithOther(teamsByCollege, 8, "colleges"),
    collegePeople: topWithOther(peopleByCollege, 8, "colleges"),
    hostSplit: [
      { label: "Sathyabama (host college)", teams: hostTeams, people: hostPeople },
      { label: "Other colleges", teams: total - hostTeams, people: people - hostPeople },
    ],
    collegeGroups: colleges.groups().filter((g) => g.spellings.length > 1).map((g) => ({ name: g.name, spellings: g.spellings })),
    years: countBy(everyone, (p) => yearOf(p.year || p.team.year) || "Not given"),
    departments: topWithOther(countBy(everyone, (p) => departmentOf(p.department || p.team.department) || "Not given"), 9, "departments"),
    emails: countBy(teams, (t) => t.registrationEmail?.status || "Not Sent"),
    sizes: countBy(teams, (t) => peopleOf(t).length).sort((a, b) => a.label - b.label),
    sources: countBy(teams, (t) => ({ GOOGLE_SHEETS: "Google Form (sheet import)", MANUAL: "Website registration", RECOVERY: "Recovered (basic record)", DEMO: "Demo" }[t.importSource] || t.importSource || "Unknown")),
    prototypeCategories: [
      { label: "Software (website / app)", count: prototypes.filter((t) => t.prototypeSubmission?.category === "SOFTWARE").length },
      { label: "Hardware (YouTube video)", count: prototypes.filter((t) => t.prototypeSubmission?.category === "HARDWARE").length },
      { label: "Not submitted yet", count: total - prototypes.length },
    ],
    completeness,
    themeByCollege,
    progress: [
      { label: "Registered", count: total },
      { label: "Members listed", count: membersListed },
      { label: "Login email sent", count: emailed },
      { label: "Round 1 PDF submitted", count: pdf },
      { label: "Round 2 prototype submitted", count: prototypes.length },
    ],
    health,
    security,
  });
};

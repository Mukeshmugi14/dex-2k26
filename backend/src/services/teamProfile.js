// A team's year(s) of study and department(s) for admin lists: the team's own value plus any different value
// a member gave (e.g. "First Year, Second Year" when one member is in second year). Spellings compared loosely.
const tidy = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const distinct = (values) => {
  const seen = new Map();
  for (const value of values.map(tidy).filter(Boolean)) {
    const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()];
};

export const teamStudyInfo = (team) => ({
  year: distinct([team.year, ...(team.members || []).map((m) => m?.year)]).join(", "),
  department: distinct([team.department, ...(team.members || []).map((m) => m?.department)]).join(", "),
});

export const STUDY_FIELDS = "year department members.year members.department";

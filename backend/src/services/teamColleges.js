// Which colleges a team's people come from. A team is cross-college when its people resolve to more than one
// registry college. The Team Head counts under the team's college; a member without a college (or with a
// placeholder like "NA") does too. Unresolved names count by their submitted spelling, so they're never merged.
const tidy = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const norm = (value) => tidy(value).toLowerCase();
export const PLACEHOLDER_COLLEGE = /^(n\/?a|nil|null|none|no|-+|\.+|same|same as above)$/i;

const listedMembers = (team) => (team.members || []).filter((m) => tidy(m?.name) || norm(m?.email));
const headListed = (team, members) => members.some((m) => (norm(m.email) && norm(m.email) === norm(team.leader?.email)) || (norm(m.name) && norm(m.name) === norm(team.leader?.name)));

/** lookup: from createCollegeLookup(), already prepared with the members' college names. */
export const teamCollegeMix = (team, lookup) => {
  const home = lookup.forTeam(team);
  const members = listedMembers(team);
  const people = [
    ...(headListed(team, members) || !(team.leader?.name || team.leader?.email) ? [] : [{ name: team.leader?.name, college: "" }]),
    ...members,
  ];
  const groups = new Map();
  for (const person of people) {
    const raw = tidy(person.college);
    const college = raw && !PLACEHOLDER_COLLEGE.test(raw) ? lookup.forRaw(raw) : home;
    if (!college?.name) continue;
    const key = college.collegeId || college.name;
    const group = groups.get(key) || { collegeId: college.collegeId || null, name: college.name, people: 0, names: [] };
    group.people += 1;
    if (tidy(person.name)) group.names.push(tidy(person.name));
    groups.set(key, group);
  }
  const colleges = [...groups.values()].sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));
  return { colleges, crossCollege: colleges.length > 1 };
};

export const memberCollegeNames = (teams) => teams.flatMap((t) => (t.members || []).map((m) => m.college));

// Team Head Portal: teams may update their own team and member details until the edit deadline.
// The Team Head email (login) and Team ID (password) are never editable here.

// Editable through 26 Oct 2026, 11:59 PM IST; from 27 Oct 12:00 AM IST it is locked.
// Override with TEAM_DETAILS_EDIT_DEADLINE (ISO date with offset) if it moves.
const DEFAULT_DEADLINE = "2026-10-26T23:59:59.999+05:30";
export const getTeamDetailsEditDeadline = () => {
  const configured = new Date(process.env.TEAM_DETAILS_EDIT_DEADLINE || DEFAULT_DEADLINE);
  return Number.isNaN(configured.getTime()) ? new Date(DEFAULT_DEADLINE) : configured;
};
export const teamDetailsEditable = () => Date.now() <= getTeamDetailsEditDeadline().getTime();
export const TEAM_DETAILS_EDIT_CLOSED_MESSAGE = "The team details editing deadline (26 October 2026, 11:59 PM IST) has passed. Your team and member details can no longer be edited.";

const MAX_TEXT = 120;
const text = (value) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isPhone = (value) => /^\+?[\d\s-]{7,20}$/.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15;

const checkLength = (errors, key, value, label) => {
  if (value.length > MAX_TEXT) errors[key] = `${label} must be ${MAX_TEXT} characters or fewer.`;
};

/**
 * Validates the Team Head's edit. `memberCount` is the number of members the portal showed,
 * so the edit can only change those members' details, not add or remove members.
 * Returns { errors } or { value: { team, leader, members } } with cleaned values.
 */
export const validateTeamDetails = (body, memberCount) => {
  const errors = {};
  const team = {
    teamName: text(body?.teamName),
    college: text(body?.college),
    department: text(body?.department),
    year: text(body?.year),
  };
  const leader = { name: text(body?.teamHead), phone: text(body?.teamHeadPhone) };

  if (!team.teamName) errors.teamName = "Team name is required.";
  if (!team.college) errors.college = "College is required.";
  if (!leader.name) errors.teamHead = "Team Head name is required.";
  if (!leader.phone) errors.teamHeadPhone = "Team Head phone number is required.";
  else if (!isPhone(leader.phone)) errors.teamHeadPhone = "Enter a valid phone number.";
  checkLength(errors, "teamName", team.teamName, "Team name");
  checkLength(errors, "college", team.college, "College");
  checkLength(errors, "department", team.department, "Department");
  checkLength(errors, "year", team.year, "Year");
  checkLength(errors, "teamHead", leader.name, "Team Head name");

  const given = Array.isArray(body?.members) ? body.members : null;
  if (!given || given.length !== memberCount) {
    errors.members = "The member list does not match your team. Please refresh and try again.";
    return { errors };
  }

  const seen = new Set();
  const members = given.map((member, index) => {
    const clean = {
      name: text(member?.name),
      email: text(member?.email).toLowerCase(),
      phone: text(member?.phone),
      studentId: text(member?.studentId),
      college: text(member?.college),
      department: text(member?.department),
      year: text(member?.year),
    };
    const key = (field) => `member-${index}-${field}`;
    const nameKey = clean.name.toLowerCase();
    if (!clean.name || ["undefined", "null"].includes(nameKey)) errors[key("name")] = "Member name is required.";
    else if (seen.has(nameKey)) errors[key("name")] = "Each member must have a different name.";
    seen.add(nameKey);
    if (clean.email && !isEmail(clean.email)) errors[key("email")] = "Enter a valid email address.";
    if (clean.phone && !isPhone(clean.phone)) errors[key("phone")] = "Enter a valid phone number.";
    for (const field of ["name", "email", "studentId", "college", "department", "year"]) checkLength(errors, key(field), clean[field], "This field");
    return clean;
  });

  return Object.keys(errors).length ? { errors } : { value: { team, leader, members } };
};

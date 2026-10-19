import * as XLSX from "xlsx";
import Registration, { PROJECT_THEMES } from "../models/Registration.js";
import { getNextSequentialTeamId } from "./teamIdService.js";
import { referralCategory } from "./referralSource.js";
import { PLACEHOLDER_COLLEGE } from "./teamColleges.js";

const clean = (val) => (val !== undefined && val !== null ? String(val).trim() : "");
const normalizeKey = (val) => clean(val).toLowerCase().replace(/[^a-z0-9]/g, "");
const nameKey = (val) => clean(val).toLowerCase().replace(/\s+/g, " ");
const personKey = (val) => clean(val).toLowerCase().replace(/[^a-z]/g, "");
const escapeRegex = (val) => val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The people in a team (Team Head + members) as comparable name keys.
export const peopleKeys = (leaderName, members = []) => new Set([leaderName, ...members.map((m) => m?.name)].map(personKey).filter(Boolean));
const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));
// Two teams are the same people when at least half of the smaller team's people match
// (members may have been added in the Team Portal since).
export const samePeople = (a, b) => {
  const small = Math.min(a.size, b.size);
  if (!small) return false;
  let shared = 0;
  for (const k of a) if (b.has(k)) shared++;
  return shared / small >= 0.5;
};
// "Team X" taken → "Team X 2.0", then "Team X 3.0", … (case-insensitive).
export const nextFreeTeamName = (base, taken) => {
  if (!taken.has(nameKey(base))) return base;
  let n = 2;
  while (taken.has(nameKey(`${base} ${n}.0`))) n++;
  return `${base} ${n}.0`;
};

// Fuzzy map project themes
export const normalizeTheme = (rawTheme) => {
  const norm = clean(rawTheme).toUpperCase();
  if (!norm) return "OPEN INNOVATION";
  for (const theme of PROJECT_THEMES) {
    if (theme === norm) return theme;
  }
  if (norm.includes("BLOCKCHAIN") || norm.includes("CYBER") || norm.includes("SECURITY")) return "BLOCKCHAIN & CYBERSECURITY";
  if (norm.includes("HEALTH") || norm.includes("MED")) return "HEALTHCARE";
  if (norm.includes("AI") || norm.includes("MACHINE") || norm.includes("LEARN") || norm.includes("ML")) return "AI & MACHINE LEARNING";
  if (norm.includes("SUSTAINAB") || norm.includes("GREEN") || norm.includes("ENVIRONMENT")) return "SUSTAINABILITY DEVELOPMENT";
  if (norm.includes("FINTECH") || norm.includes("EDTECH") || norm.includes("FINANCE") || norm.includes("EDU")) return "FINTECH & EDTECH";
  return "OPEN INNOVATION";
};

/**
 * Extracts member index (1 to 10) from header string if it represents a team member.
 * e.g. "Member 2 Name", "Contact Number (Member 2)", "Team Member 3", "Participant 4"
 */
export const extractMemberIndex = (header) => {
  const norm = clean(header).toLowerCase();

  // "member 2", "member2", "member_2", "member-2", "teammember 2", "(member 2)"
  const m1 = norm.match(/(?:team\s*)?member\s*[-_#\s(]?\s*(\d+)/i);
  if (m1) return parseInt(m1[1], 10);

  // "participant 2", "participant2", "participant-2", "(participant 2)"
  const m2 = norm.match(/participant\s*[-_#\s(]?\s*(\d+)/i);
  if (m2) return parseInt(m2[1], 10);

  // "student 2", "student2"
  const m3 = norm.match(/student\s*[-_#\s(]?\s*(\d+)/i);
  if (m3) return parseInt(m3[1], 10);

  // Word numbers: "member two", "member three", "member four", "member five"
  const wordNums = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const m4 = norm.match(/(?:team\s*)?member\s+(one|two|three|four|five|six|seven|eight|nine|ten)/i);
  if (m4) return wordNums[m4[1].toLowerCase()];

  // Inverted: "2nd member", "3rd member"
  const m5 = norm.match(/(\d+)(?:st|nd|rd|th)?\s*(?:team\s*)?member/i);
  if (m5) return parseInt(m5[1], 10);

  return null;
};

/**
 * Detects the specific field a member header represents:
 * phone, email, college, year, department, studentId, or name.
 */
export const detectMemberField = (header) => {
  const k = normalizeKey(header);

  if (k.includes("phone") || k.includes("contact") || k.includes("mobile") || k.includes("whatsapp") || k.includes("cell") || k.includes("number")) {
    return "phone";
  }

  if (k.includes("email") || k.includes("mail")) {
    return "email";
  }

  if (k.includes("college") || k.includes("institution") || k.includes("campus") || k.includes("university") || k.includes("institute") || k.includes("school")) {
    return "college";
  }

  if (k.includes("year") || k.includes("batch") || k.includes("semester") || k.includes("sem")) {
    return "year";
  }

  if (k.includes("dept") || k.includes("department") || k.includes("branch") || k.includes("degree") || k.includes("course") || k.includes("stream")) {
    return "department";
  }

  if (k.includes("regno") || k.includes("registerno") || k.includes("rollno") || k.includes("studentid") || k.includes("register") || k.includes("roll") || k.includes("reg")) {
    return "studentId";
  }

  return "name";
};

// Column key mapping detection
export const detectColumns = (headers) => {
  const mapping = {
    teamName: null,
    leaderName: null,
    leaderEmail: null,
    leaderPhone: null,
    college: null,
    department: null,
    year: null,
    projectTheme: null,
    teamSize: null,
    mentorName: null,
    mentorEmail: null,
    mentorPhone: null,
    membersBlob: null,
    referral: null, // "From where did you know about this event?"
    timestamp: null, // Google Form submission time
    memberNumbered: {}, // index -> { name, email, phone, college, year, department, studentId }
  };

  let lastMemberIdx = null;
  headers.forEach((header) => {
    const raw = header;
    const k = normalizeKey(header);

    // 0. How the team heard about the event, and the form's timestamp.
    if (!mapping.referral && (k.includes("knowabout") || k.includes("fromwhere") || k.includes("hearabout") || k.includes("howdidyou") || k.includes("referr"))) {
      mapping.referral = raw;
      return;
    }
    if (!mapping.timestamp && (k === "timestamp" || k === "submittedat")) {
      mapping.timestamp = raw;
      return;
    }

    // 1. Check if column belongs to a numbered member
    const memberIdx = extractMemberIndex(header);
    if (memberIdx !== null) {
      const field = detectMemberField(header);
      if (!mapping.memberNumbered[memberIdx]) mapping.memberNumbered[memberIdx] = {};
      mapping.memberNumbered[memberIdx][field] = raw;
      lastMemberIdx = memberIdx;
      return; // Do NOT let member columns pollute leader detection!
    }

    // 1b. Google Forms often label a member's college/year columns without the number ("College name", "Year of
    // Study 3") right after "Member N - Full Name"; they belong to that member, not to the Team Head.
    if (lastMemberIdx !== null) {
      const field = detectMemberField(header);
      const slot = mapping.memberNumbered[lastMemberIdx];
      if (["college", "year", "department"].includes(field) && !slot[field]) {
        slot[field] = raw;
        return;
      }
    }

    // 2. Check for faculty mentor columns
    const isMentor = k.includes("mentor") || k.includes("faculty") || k.includes("guide") || k.includes("advisor");
    if (isMentor) {
      if (k.includes("email") || k.includes("mail")) {
        if (!mapping.mentorEmail) mapping.mentorEmail = raw;
      } else if (k.includes("phone") || k.includes("contact") || k.includes("mobile") || k.includes("whatsapp")) {
        if (!mapping.mentorPhone) mapping.mentorPhone = raw;
      } else {
        if (!mapping.mentorName) mapping.mentorName = raw;
      }
      return;
    }

    // 3. Team Leader Name (check BEFORE teamName so "Name of the Team Leader" is not taken as teamName!)
    const isLeaderNameCandidate =
      k.includes("teamleader") ||
      k.includes("leadername") ||
      k.includes("leadname") ||
      k.includes("headname") ||
      k.includes("nameofteamleader") ||
      k.includes("nameoftheteamleader") ||
      k.includes("teamlead") ||
      k.includes("leader") ||
      k.includes("lead") ||
      k.includes("captain") ||
      k === "head" ||
      k.includes("participant1") ||
      k.includes("student1");

    if (!mapping.leaderName && isLeaderNameCandidate) {
      mapping.leaderName = raw;
      return;
    }

    // 4. Team Name (must NOT contain leader / lead / head / member)
    const isTeamNameCandidate =
      !k.includes("leader") &&
      !k.includes("lead") &&
      !k.includes("head") &&
      !k.includes("member") &&
      (k.includes("teamname") ||
        k === "team" ||
        k.includes("projecttitle") ||
        k.includes("projectname") ||
        k.includes("groupname") ||
        k.includes("titleofproject") ||
        k.includes("nameoftheteam") ||
        k.includes("titleoftheproject"));

    if (!mapping.teamName && isTeamNameCandidate) {
      mapping.teamName = raw;
      return;
    }

    // 5. Team Leader Email
    if (!mapping.leaderEmail && (k.includes("leaderemail") || k.includes("teamleaderemail") || k.includes("emailaddress") || k.includes("emailid") || k === "email" || k === "mail")) {
      mapping.leaderEmail = raw;
      return;
    }

    // 6. Team Leader Phone
    if (!mapping.leaderPhone && (k.includes("teamleaderphone") || k.includes("leaderphone") || k.includes("phonenumber") || k.includes("contactnumber") || k.includes("mobilenumber") || k.includes("whatsappnumber") || k.includes("phone") || k.includes("contact") || k.includes("mobile") || k.includes("whatsapp"))) {
      mapping.leaderPhone = raw;
      return;
    }

    // 7. College / Institution
    if (!mapping.college && (k.includes("collegename") || k.includes("institutionname") || k.includes("college") || k.includes("institution") || k.includes("university") || k.includes("campus") || k.includes("school"))) {
      mapping.college = raw;
      return;
    }

    // 8. Department / Branch / Degree
    if (!mapping.department && (k.includes("department") || k.includes("dept") || k.includes("branch") || k.includes("course") || k.includes("degree") || k.includes("stream"))) {
      mapping.department = raw;
      return;
    }

    // 9. Year of study
    if (!mapping.year && (k.includes("yearofstudy") || k.includes("currentyear") || k.includes("year") || k.includes("batch") || k.includes("semester") || k.includes("sem"))) {
      mapping.year = raw;
      return;
    }

    // 10. Project Theme / Domain
    if (!mapping.projectTheme && (k.includes("projecttheme") || k.includes("projectdomain") || k.includes("theme") || k.includes("domain") || k.includes("track") || k.includes("category") || k.includes("problemstatement") || k.includes("topic"))) {
      mapping.projectTheme = raw;
      return;
    }

    // 11. Team Size (explicit column)
    if (!mapping.teamSize && (k.includes("teamsize") || k.includes("numberofmembers") || k.includes("totalmembers") || k.includes("memberscount") || k.includes("size"))) {
      mapping.teamSize = raw;
      return;
    }

    // 12. Members blob
    if (!mapping.membersBlob && (k.includes("teammembers") || k === "members" || k.includes("membernames") || k.includes("listofmembers") || k.includes("othermembers"))) {
      mapping.membersBlob = raw;
      return;
    }
  });

  // Secondary fallbacks for email and leaderName
  if (!mapping.leaderEmail) {
    const fallbackEmail = headers.find((h) => {
      const k = normalizeKey(h);
      return k.includes("email") || k.includes("mail");
    });
    if (fallbackEmail) mapping.leaderEmail = fallbackEmail;
  }

  if (!mapping.leaderName) {
    const fallbackName = headers.find((h) => {
      const k = normalizeKey(h);
      return (k === "name" || k === "fullname" || k.includes("studentname")) && h !== mapping.teamName && h !== mapping.mentorName;
    });
    if (fallbackName) mapping.leaderName = fallbackName;
  }

  return mapping;
};

/**
 * Parses spreadsheet buffer (.xlsx, .xls, .csv) and imports/updates teams
 * @param {Buffer} buffer
 * @returns {Promise<{ summary: Object, invalidRecords: Array, detectedColumns: Object, teams: Array }>}
 */
export const processSpreadsheetImport = async (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Invalid spreadsheet file buffer.");
  }

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Spreadsheet contains no sheets.");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

  if (!rows || rows.length === 0) {
    return {
      summary: { totalRows: 0, importedCount: 0, updatedCount: 0, skippedCount: 0, duplicateCount: 0, invalidCount: 0 },
      invalidRecords: [],
      detectedColumns: {},
      teams: [],
    };
  }

  const headers = Object.keys(rows[0] || {});
  const colMap = detectColumns(headers);

  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  const invalidRecords = [];
  const processedTeams = [];
  const renamedTeams = [];
  // First row per Team Head email in this file: { row, teamName, name, people }.
  const seenEmailsInFile = new Map();
  // Every team name already used (site + this upload), so a repeated name gets the next "2.0", "3.0", …
  const takenNames = new Set((await Registration.find({}, "teamName").lean()).map((t) => nameKey(t.teamName)).filter(Boolean));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // header is row 1

    let rawLeaderName = colMap.leaderName ? clean(row[colMap.leaderName]) : "";
    let rawLeaderEmail = colMap.leaderEmail ? clean(row[colMap.leaderEmail]).toLowerCase() : "";
    let rawLeaderPhone = colMap.leaderPhone ? clean(row[colMap.leaderPhone]) : "";
    const rawCollege = colMap.college ? clean(row[colMap.college]) : "";
    const rawDept = colMap.department ? clean(row[colMap.department]) : "";
    const rawYear = colMap.year ? clean(row[colMap.year]) : "";
    const rawTheme = colMap.projectTheme ? clean(row[colMap.projectTheme]) : "";
    const rawMentorName = colMap.mentorName ? clean(row[colMap.mentorName]) : "";
    const rawMentorEmail = colMap.mentorEmail ? clean(row[colMap.mentorEmail]) : "";
    const rawMentorPhone = colMap.mentorPhone ? clean(row[colMap.mentorPhone]) : "";
    const rawReferral = colMap.referral ? clean(row[colMap.referral]) : "";
    const referralSource = rawReferral ? { raw: rawReferral, category: referralCategory(rawReferral), source: "sheet" } : undefined;
    const submittedAt = colMap.timestamp ? new Date(row[colMap.timestamp]) : null;
    const formSubmittedAt = submittedAt && !Number.isNaN(submittedAt.getTime()) ? submittedAt : undefined;

    // If Member 1 columns exist and leader fields are empty, use Member 1
    if (colMap.memberNumbered[1]) {
      const m1 = colMap.memberNumbered[1];
      if (!rawLeaderName && m1.name) rawLeaderName = clean(row[m1.name]);
      if (!rawLeaderEmail && m1.email) rawLeaderEmail = clean(row[m1.email]).toLowerCase();
      if (!rawLeaderPhone && m1.phone) rawLeaderPhone = clean(row[m1.phone]);
    }

    // Fallback for Team Name: If not present in Google Sheet, generate from Leader Name
    let rawTeamName = colMap.teamName ? clean(row[colMap.teamName]) : "";
    if (!rawTeamName) {
      rawTeamName = rawLeaderName ? `Team ${rawLeaderName}` : `Team Dexathon ${i + 1}`;
    }

    // Email validation
    if (!rawLeaderEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawLeaderEmail)) {
      invalidRecords.push({
        row: rowNum,
        teamName: rawTeamName,
        email: rawLeaderEmail || "N/A",
        reason: "Missing or invalid Leader Email",
      });
      continue;
    }

    const emailKey = rawLeaderEmail.toLowerCase();

    // Parse team members (Member 2, Member 3, etc.)
    const members = [];
    const sortedMemberKeys = Object.keys(colMap.memberNumbered)
      .map(Number)
      .sort((a, b) => a - b);

    for (const num of sortedMemberKeys) {
      const fields = colMap.memberNumbered[num];
      const mName = fields.name ? clean(row[fields.name]) : "";
      const mCollegeRaw = fields.college ? clean(row[fields.college]) : "";
      const mCollege = PLACEHOLDER_COLLEGE.test(mCollegeRaw) ? "" : mCollegeRaw; // "NA", "nil" → the team's college
      const mYear = fields.year ? clean(row[fields.year]) : "";
      const mDept = fields.department ? clean(row[fields.department]) : "";
      const mPhone = fields.phone ? clean(row[fields.phone]) : "";
      const mEmail = fields.email ? clean(row[fields.email]) : "";
      const mId = fields.studentId ? clean(row[fields.studentId]) : "";

      if (!mName) continue;

      // Don't add if this member is identical to the leader
      const isLeaderName = rawLeaderName && mName.toLowerCase() === rawLeaderName.toLowerCase();
      const isLeaderEmail = rawLeaderEmail && mEmail && mEmail.toLowerCase() === rawLeaderEmail.toLowerCase();
      const isLeaderPhone = rawLeaderPhone && mPhone && mPhone.replace(/\D/g, "") === rawLeaderPhone.replace(/\D/g, "");

      if (isLeaderName || isLeaderEmail || (isLeaderPhone && mPhone)) {
        if (!rawLeaderPhone && mPhone) rawLeaderPhone = mPhone;
        continue;
      }

      // Avoid duplicate members in the same team
      const alreadyAdded = members.some((existing) =>
        existing.name.toLowerCase() === mName.toLowerCase() ||
        (mPhone && existing.phone && existing.phone.replace(/\D/g, "") === mPhone.replace(/\D/g, ""))
      );
      if (alreadyAdded) continue;

      members.push({
        name: mName,
        college: mCollege || rawCollege || "",
        year: mYear || rawYear || "",
        department: mDept || rawDept || "",
        phone: mPhone,
        email: mEmail,
        studentId: mId,
      });
    }

    // Fallback: Check members blob string if no numbered member columns had names
    if (members.length === 0 && colMap.membersBlob) {
      const blob = clean(row[colMap.membersBlob]);
      if (blob) {
        const splitNames = blob.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
        splitNames.forEach((n) => {
          if (n.toLowerCase() !== rawLeaderName.toLowerCase()) {
            members.push({
              name: n,
              college: rawCollege || "",
              year: rawYear || "",
              department: rawDept || "",
            });
          }
        });
      }
    }

    // Duplicates within this file. Same team name + Team Head email + members → the same submission twice, skipped.
    // The same Team Head email with a different team: only the first is imported (the email is the team's login).
    const people = peopleKeys(rawLeaderName, members);
    const seen = seenEmailsInFile.get(emailKey);
    if (seen) {
      if (seen.name === nameKey(rawTeamName) && sameSet(seen.people, people)) {
        duplicateCount++;
      } else {
        invalidRecords.push({ row: rowNum, teamName: rawTeamName, email: rawLeaderEmail, reason: `Same Team Head email as row ${seen.row} ("${seen.teamName}") with different details; only row ${seen.row} was imported` });
      }
      continue;
    }
    seenEmailsInFile.set(emailKey, { row: rowNum, teamName: rawTeamName, name: nameKey(rawTeamName), people });

    // Determine accurate team size: Leader + all members
    const parsedTeamSize = colMap.teamSize ? parseInt(clean(row[colMap.teamSize]), 10) : 0;
    const computedTeamSize = 1 + members.length;
    const teamSize = Number.isFinite(parsedTeamSize) && parsedTeamSize >= computedTeamSize ? parsedTeamSize : computedTeamSize;

    const collegeType = /sathyabama/i.test(rawCollege) ? "sathyabama" : "other";
    const projectTheme = normalizeTheme(rawTheme);

    const leaderObj = {
      name: rawLeaderName || `${rawTeamName} Head`,
      email: rawLeaderEmail,
      phone: rawLeaderPhone,
    };

    const mentorObj = {
      name: rawMentorName,
      email: rawMentorEmail,
      phone: rawMentorPhone,
    };

    // Database lookup: the same Team Head email is the same team (resubmission or update).
    const existing = await Registration.findOne({ "leader.email": { $regex: `^\\s*${escapeRegex(rawLeaderEmail)}\\s*$`, $options: "i" } });

    if (existing) {
      // Fill in how the team heard about the event / when it submitted the form, if not recorded yet.
      let filled = false;
      if (referralSource && !existing.referralSource?.raw) { existing.referralSource = referralSource; filled = true; }
      if (formSubmittedAt && !existing.formSubmittedAt) { existing.formSubmittedAt = formSubmittedAt; filled = true; }
      // If the existing team has missing/incomplete member data and the sheet has members,
      // enrich it with full details while preserving its teamId and registrationNumber!
      const existingMembersCount = (existing.members || []).length;
      if (members.length > 0 && (existingMembersCount === 0 || existingMembersCount < members.length)) {
        existing.members = members;
        existing.teamSize = teamSize;
        if (!existing.leader?.phone && rawLeaderPhone) {
          if (!existing.leader) existing.leader = {};
          existing.leader.phone = rawLeaderPhone;
        }
        if (rawLeaderName && (!existing.leader?.name || existing.leader.name.includes("Head"))) {
          existing.leader.name = rawLeaderName;
        }
        if (!existing.college || existing.college === "Sathyabama Institute of Science and Technology") {
          if (rawCollege) {
            existing.college = rawCollege;
            existing.collegeName = rawCollege;
            existing.collegeType = collegeType;
          }
        }
        if (!existing.department && rawDept) existing.department = rawDept;
        if (!existing.year && rawYear) existing.year = rawYear;
        if (!existing.projectTheme && projectTheme) existing.projectTheme = projectTheme;

        await existing.save();
        updatedCount++;
        processedTeams.push(existing);
        continue;
      }

      // If existing team already has complete data, leave it untouched ("let it free")
      if (filled) await existing.save();
      skippedCount++;
      processedTeams.push(existing);
      continue;
    }

    // Same team name with a different Team Head email. If it's the same people (e.g. the email was corrected in the
    // Team Portal), it's already on the site; otherwise it's another team that shares the name → "2.0", "3.0", …
    const sameName = await Registration.find({ teamName: { $regex: `^\\s*${escapeRegex(rawTeamName)}\\s*$`, $options: "i" } }, "teamId teamName leader members").lean();
    const samePeopleTeam = sameName.find((t) => samePeople(peopleKeys(t.leader?.name, t.members), people));
    if (samePeopleTeam) {
      invalidRecords.push({ row: rowNum, teamName: rawTeamName, email: rawLeaderEmail, reason: `Already on the site as ${samePeopleTeam.teamId} (same team name and members, Team Head email ${samePeopleTeam.leader?.email || "-"}); not imported again` });
      skippedCount++;
      continue;
    }
    const finalTeamName = nextFreeTeamName(rawTeamName, takenNames);
    takenNames.add(nameKey(finalTeamName));

    // Automatically form brand new team with sequential DEX26 Team ID
    const { teamId: seqTeamId, registrationNumber: seqRegNum } = await getNextSequentialTeamId();
    const newTeam = new Registration({
      teamId: seqTeamId,
      registrationNumber: seqRegNum,
      teamName: finalTeamName,
      teamSize,
      projectTheme,
      college: rawCollege || "Sathyabama Institute of Science and Technology",
      collegeType,
      collegeName: rawCollege || "Sathyabama Institute of Science and Technology",
      department: rawDept,
      year: rawYear,
      leader: leaderObj,
      members,
      mentor: mentorObj,
      referralSource,
      formSubmittedAt,
      importSource: "GOOGLE_SHEETS",
      importedAt: new Date(),
      rounds: {
        round1: "PENDING",
        round2: "UPCOMING",
        round3: "UPCOMING",
        scoreReleased: false,
      },
    });

    await newTeam.save();
    if (finalTeamName !== rawTeamName) renamedTeams.push({ row: rowNum, teamId: seqTeamId, from: rawTeamName, to: finalTeamName, email: rawLeaderEmail });
    importedCount++;
    processedTeams.push(newTeam);
  }

  return {
    summary: {
      totalRows: rows.length,
      importedCount,
      updatedCount,
      skippedCount,
      duplicateCount,
      renamedCount: renamedTeams.length,
      invalidCount: invalidRecords.length,
    },
    invalidRecords,
    renamedTeams,
    detectedColumns: {
      teamName: colMap.teamName || "Auto-generated from Leader",
      leaderName: colMap.leaderName || "Not detected",
      leaderEmail: colMap.leaderEmail || "Not detected",
      leaderPhone: colMap.leaderPhone || "Not detected",
      college: colMap.college || "Not detected",
      projectTheme: colMap.projectTheme || "Not detected",
      membersDetectedCount: Object.keys(colMap.memberNumbered).length || (colMap.membersBlob ? "Blob column" : 0),
    },
    teams: processedTeams,
  };
};

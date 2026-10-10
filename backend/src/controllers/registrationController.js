import mongoose from "mongoose";
import Registration, { PROJECT_THEMES } from "../models/Registration.js";
import { getNextSequentialTeamId } from "../services/teamIdService.js";

const reject = (response, team, message) => {
  console.warn(`Registration rejected (${team?.teamName || "no team name"}): ${message}`);
  return response.status(400).json({ message });
};

export const createRegistration = async (request, response) => {
  const { team, members } = request.body;

  if (team && !PROJECT_THEMES.includes(team.projectTheme)) return reject(response, team, "Please select one project theme for your team.");
  if (!team?.teamName || !["sathyabama", "other"].includes(team.collegeType) || !team.collegeName?.trim() || !Array.isArray(members) || members.length < 4 || members.length > 6) {
    return reject(response, team, "A complete team of 4–6 members is required.");
  }

  // Members are stored as name, email and phone; any extra fields from older clients are ignored.
  const cleanMembers = members.map((member) => ({ name: member?.name, email: member?.email, phone: member?.phone }));
  const { teamId: seqTeamId, registrationNumber: seqRegNum } = await getNextSequentialTeamId();
  const build = () => ({
    teamId: seqTeamId,
    registrationNumber: seqRegNum,
    teamName: team.teamName,
    projectTheme: team.projectTheme,
    college: team.collegeName.trim(),
    collegeType: team.collegeType,
    collegeName: team.collegeName.trim(),
    department: team.department,
    year: team.year,
    leader: { name: team.leaderName, email: team.leaderEmail, phone: team.leaderPhone },
    members: cleanMembers,
    importSource: "MANUAL",
  });

  try {
    let registration;
    try {
      registration = await Registration.create(build());
    } catch (error) {
      // A generated team ID / registration number can rarely collide; retry once with fresh ones.
      if (error.code !== 11000) throw error;
      registration = await Registration.create(build());
    }
    console.log(`Registration saved: ${registration.teamId} (${registration.teamName}, ${registration.projectTheme}).`);
    return response.status(201).json(registration);
  } catch (error) {
    if (error.name === "ValidationError") return reject(response, team, Object.values(error.errors)[0]?.message || "Some registration details are invalid.");
    console.error("Registration save failed:", { team: team.teamName, code: error.code || null, message: error.message });
    return response.status(500).json({ message: "Unable to save your registration right now. Please try again in a moment." });
  }
};

export const getRegistration = async (request, response) => {
  const registration = await Registration.findById(request.params.id);
  if (!registration) return response.status(404).json({ message: "Registration not found." });
  return response.json(registration);
};

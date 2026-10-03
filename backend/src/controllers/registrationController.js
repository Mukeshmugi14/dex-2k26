import Registration from "../models/Registration.js";
import PaymentSettings from "../models/PaymentSettings.js";

const makeIdentifier = (prefix) => `${prefix}-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`;

export const createRegistration = async (request, response) => {
  const { team, members } = request.body;

  if (!team?.teamName || !["sathyabama", "other"].includes(team.collegeType) || !team.collegeName?.trim() || !Array.isArray(members) || members.length < 4 || members.length > 6) {
    return response.status(400).json({ message: "A complete team of 4–6 members is required." });
  }

  const settings = await PaymentSettings.findOne();
  const registrationAmount = settings?.registrationAmount > 0 ? settings.registrationAmount : 300;
  const registration = await Registration.create({
    teamId: makeIdentifier("DX2026"),
    registrationNumber: makeIdentifier("REG"),
    teamName: team.teamName,
    college: team.collegeName.trim(),
    collegeType: team.collegeType,
    collegeName: team.collegeName.trim(),
    department: team.department,
    year: team.year,
    leader: { name: team.leaderName, email: team.leaderEmail, phone: team.leaderPhone },
    members,
    payment: { amount: registrationAmount },
  });

  return response.status(201).json(registration);
};

export const getRegistration = async (request, response) => {
  const registration = await Registration.findById(request.params.id);
  if (!registration) return response.status(404).json({ message: "Registration not found." });
  return response.json(registration);
};

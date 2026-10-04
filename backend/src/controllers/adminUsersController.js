import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Admin, { ADMIN_ROLES } from "../models/Admin.js";
import { forgetAdminAccount } from "../middleware/authMiddleware.js";
import { adminProfile } from "../services/adminAccess.js";

const USERNAME = /^[a-z0-9._-]{3,40}$/;
const MIN_PASSWORD = 8;
const view = (admin) => ({ ...adminProfile(admin), active: admin.active !== false, lastLoginAt: admin.lastLoginAt || null, createdAt: admin.createdAt || null });
const activeSuperAdmins = (excludeId) => Admin.countDocuments({ role: "SUPER_ADMIN", active: { $ne: false }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });

export const listAdmins = async (_request, response) => {
  const admins = await Admin.find({}, "username name role active lastLoginAt createdAt").sort({ role: 1, username: 1 }).lean();
  return response.json({ admins: admins.map(view), roles: ADMIN_ROLES });
};

export const createAdmin = async (request, response) => {
  const username = typeof request.body.username === "string" ? request.body.username.trim().toLowerCase() : "";
  const name = typeof request.body.name === "string" ? request.body.name.trim().slice(0, 80) : "";
  const { role, password } = request.body;
  const errors = {};
  if (!USERNAME.test(username)) errors.username = "Use 3–40 lowercase letters, numbers, dots, dashes or underscores.";
  if (!ADMIN_ROLES.includes(role)) errors.role = "Choose a role.";
  if (typeof password !== "string" || password.length < MIN_PASSWORD) errors.password = `Password must be at least ${MIN_PASSWORD} characters.`;
  if (!errors.username && await Admin.exists({ username })) errors.username = "That username is already taken.";
  if (Object.keys(errors).length) return response.status(400).json({ message: "Please correct the highlighted fields.", errors });
  const admin = await Admin.create({ username, name, role, active: true, passwordHash: await bcrypt.hash(password, 12) });
  return response.status(201).json({ message: `Admin "${username}" created.`, admin: view(admin) });
};

export const updateAdmin = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Admin not found." });
  const admin = await Admin.findById(request.params.id);
  if (!admin) return response.status(404).json({ message: "Admin not found." });
  const self = String(admin._id) === request.admin.id;
  const { role, active, password } = request.body;

  if (role !== undefined && !ADMIN_ROLES.includes(role)) return response.status(400).json({ message: "Choose a valid role." });
  if (self && ((role !== undefined && role !== admin.role) || active === false)) return response.status(400).json({ message: "You can't change your own role or disable your own account." });
  const losesSuper = admin.role === "SUPER_ADMIN" && ((role !== undefined && role !== "SUPER_ADMIN") || active === false);
  if (losesSuper && (await activeSuperAdmins(admin._id)) === 0) return response.status(400).json({ message: "At least one active General Admin is required." });
  if (password !== undefined && (typeof password !== "string" || password.length < MIN_PASSWORD)) return response.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters.` });

  if (typeof request.body.name === "string") admin.name = request.body.name.trim().slice(0, 80);
  if (role !== undefined) admin.role = role;
  if (typeof active === "boolean") admin.active = active;
  if (password) admin.passwordHash = await bcrypt.hash(password, 12);
  await admin.save();
  forgetAdminAccount(admin._id); // role/active changes apply to that admin's next request
  return response.json({ message: password ? "Admin updated and password reset." : "Admin updated.", admin: view(admin) });
};

export const deleteAdmin = async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Admin not found." });
  if (request.params.id === request.admin.id) return response.status(400).json({ message: "You can't delete your own account." });
  const admin = await Admin.findById(request.params.id, "role active");
  if (!admin) return response.status(404).json({ message: "Admin not found." });
  if (admin.role === "SUPER_ADMIN" && admin.active !== false && (await activeSuperAdmins(admin._id)) === 0) return response.status(400).json({ message: "At least one active General Admin is required." });
  await Admin.deleteOne({ _id: admin._id });
  forgetAdminAccount(admin._id);
  return response.json({ message: "Admin deleted.", deletedId: request.params.id });
};

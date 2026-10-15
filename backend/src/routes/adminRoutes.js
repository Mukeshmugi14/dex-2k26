import { Router } from "express";
import multer from "multer";
import {
  getColleges,
  getDashboard,
  getFaculty,
  getEmailHealthStatus,
  getMe,
  sendAdminTestEmail,
  getRegistrations,
  getTeamLists,
  importSpreadsheet,
  login,
  verifyLoginOtp,
  requestPasswordSetup,
  completePasswordSetup,
  sendTeamEmail,
  getTeamEmailPreview,
  getTeamEmailStatus,
  updateRegistration,
} from "../controllers/adminController.js";
import { createAdmin, deleteAdmin, listAdmins, updateAdmin } from "../controllers/adminUsersController.js";
import { getEvaluationSettings, listSubmissions, retrySelectionEmail, saveEvaluation, streamSubmissionPdf, updateEvaluationSettings } from "../controllers/evaluationController.js";
import { bulkDeleteTeams, bulkUpdateTeams, deleteTeam } from "../controllers/teamManagementController.js";
import { decideRound, listRoundSelection, retryRoundEmail } from "../controllers/roundSelectionController.js";
import { listRounds, resendRoundEmail, updateRounds } from "../controllers/roundsController.js";
import { requireAdmin, requireSection } from "../middleware/authMiddleware.js";
import { localAdminOnly } from "../middleware/localAdminOnly.js";
import { getAnalytics } from "../controllers/analyticsController.js";
import { listPrototypes } from "../controllers/prototypesController.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
});

const router = Router();
// Admin is local-only: every admin route, including login, is refused on hosted deployments.
router.use(localAdminOnly);
router.post("/login", login);
router.post("/login/verify", verifyLoginOtp);
router.post("/login/setup", requestPasswordSetup);
router.post("/login/setup/verify", completePasswordSetup);
router.use(requireAdmin);
router.get("/me", getMe);

// Dashboard & registration overview (General Admin, Team Admin)
router.get("/dashboard", requireSection("dashboard"), getDashboard);
router.get("/analytics", requireSection("dashboard"), getAnalytics);
router.get("/prototypes", requireSection("pdf"), listPrototypes);
router.get("/faculty", requireSection("dashboard"), getFaculty);

// Teams Management (General Admin, Team Admin)
router.get("/registrations", requireSection("teams"), getRegistrations);
router.get("/colleges", requireSection("teams"), getColleges);
router.put("/registrations/:id", requireSection("teams"), updateRegistration);
router.delete("/registrations/:id", requireSection("teams"), deleteTeam);
router.post("/registrations/bulk-delete", requireSection("teams"), bulkDeleteTeams);
router.post("/registrations/bulk-update", requireSection("teams"), bulkUpdateTeams);
router.post("/teams/import", requireSection("teams"), upload.single("file"), importSpreadsheet);

// Team Lists (Google Sheets import, email sending, team tracking)
router.get("/team-lists", requireSection("teamLists"), getTeamLists);
router.post("/team-lists/import", requireSection("teamLists"), upload.single("file"), importSpreadsheet);
router.get("/team-lists/:id/email-preview", requireSection("teamLists"), getTeamEmailPreview);
router.post("/team-lists/:id/send-email", requireSection("teamLists"), sendTeamEmail);
router.get("/team-lists/:id/email-status", requireSection("teamLists"), getTeamEmailStatus);

// Aliases for legacy compatibility
router.get("/email-health", requireSection("teamLists"), getEmailHealthStatus);
router.post("/test-email", requireSection("teamLists"), sendAdminTestEmail);

// PDF submissions & evaluation (General Admin, PDF Admin)
router.get("/pdf-submissions", requireSection("pdf"), listSubmissions);
router.get("/pdf-submissions/:id/pdf", requireSection("pdf"), streamSubmissionPdf);
router.put("/pdf-submissions/:id/evaluation", requireSection("pdf"), saveEvaluation);
router.post("/pdf-submissions/:id/selection-email", requireSection("pdf"), retrySelectionEmail);
router.get("/evaluation-settings", requireSection("pdf"), getEvaluationSettings);
router.put("/evaluation-settings", requireSection("pdf"), updateEvaluationSettings);

// Rounds (General Admin, Round Admin)
router.get("/round-selection", requireSection("rounds"), listRoundSelection);
router.put("/round-selection/:id", requireSection("rounds"), decideRound);
router.post("/round-selection/:id/email", requireSection("rounds"), retryRoundEmail);
router.get("/rounds", requireSection("rounds"), listRounds);
router.put("/rounds/:id", requireSection("rounds"), updateRounds);
router.post("/rounds/:id/email", requireSection("rounds"), resendRoundEmail);

// Admin accounts (General Admin only)
router.get("/users", requireSection("users"), listAdmins);
router.post("/users", requireSection("users"), createAdmin);
router.put("/users/:id", requireSection("users"), updateAdmin);
router.delete("/users/:id", requireSection("users"), deleteAdmin);

export default router;

import { Router } from "express";
import { getOwnTeam, streamOwnPdf, teamLogin } from "../controllers/teamPortalController.js";
import { requireTeam } from "../middleware/teamAuthMiddleware.js";

const router = Router();
router.post("/login", teamLogin);
router.get("/me", requireTeam, getOwnTeam);
router.get("/me/pdf", requireTeam, streamOwnPdf);
export default router;

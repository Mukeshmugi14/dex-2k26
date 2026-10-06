import { Router } from "express";
import { getOwnTeam, streamOwnPdf, submitPrototype, teamLogin } from "../controllers/teamPortalController.js";
import { receiveOwnPdf, submitPdf } from "../controllers/submissionController.js";
import { requireTeam } from "../middleware/teamAuthMiddleware.js";

const router = Router();
router.post("/login", teamLogin);
router.get("/me", requireTeam, getOwnTeam);
router.get("/me/pdf", requireTeam, streamOwnPdf);
router.post("/me/pdf", requireTeam, receiveOwnPdf, submitPdf);
router.post("/me/prototype", requireTeam, submitPrototype);
export default router;

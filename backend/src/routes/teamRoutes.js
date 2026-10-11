import { Router } from "express";
import { deletePrototype, getOwnTeam, streamOwnPdf, submitPrototype, teamLogin, updatePrototype } from "../controllers/teamPortalController.js";
import { deleteOwnPdf, receiveOwnPdf, receiveOwnPdfReplacement, replaceOwnPdf, submitPdf } from "../controllers/submissionController.js";
import { requireTeam } from "../middleware/teamAuthMiddleware.js";

const router = Router();
router.post("/login", teamLogin);
router.get("/me", requireTeam, getOwnTeam);
router.get("/me/pdf", requireTeam, streamOwnPdf);
router.post("/me/pdf", requireTeam, receiveOwnPdf, submitPdf);
router.put("/me/pdf", requireTeam, receiveOwnPdfReplacement, replaceOwnPdf);
router.delete("/me/pdf", requireTeam, deleteOwnPdf);
router.post("/me/prototype", requireTeam, submitPrototype);
router.put("/me/prototype", requireTeam, updatePrototype);
router.delete("/me/prototype", requireTeam, deletePrototype);
export default router;

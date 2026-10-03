import { Router } from "express";
import { getSubmission, receivePdf, submitPdf } from "../controllers/submissionController.js";

const router = Router();
router.get("/:token", getSubmission);
router.post("/:token", receivePdf, submitPdf);
export default router;

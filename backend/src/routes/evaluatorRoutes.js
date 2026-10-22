import express from "express";
import { evaluatorLogin, getEvaluatorMe, getEvaluatorRubric, getEvaluatorSheet, listEvaluatorTeams, requestEvaluatorCode, saveEvaluatorSheet, setEvaluatorPassword, streamEvaluatorPdf } from "../controllers/evaluatorPortalController.js";
import { requireEvaluator } from "../middleware/evaluatorAuthMiddleware.js";

// Evaluator Portal API (available on the deployed site; separate from the local-only admin panel).
const router = express.Router();
router.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });

router.post("/auth/login", evaluatorLogin);
router.post("/auth/request-code", requestEvaluatorCode);
router.post("/auth/set-password", setEvaluatorPassword);

router.use(requireEvaluator);
router.get("/me", getEvaluatorMe);
router.get("/rubric", getEvaluatorRubric);
router.get("/teams", listEvaluatorTeams);
router.get("/teams/:id", getEvaluatorSheet);
router.get("/teams/:id/pdf", streamEvaluatorPdf);
router.put("/teams/:id/evaluation", saveEvaluatorSheet);

export default router;

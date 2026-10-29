import express from "express";
import { evaluatorLogin, getEvaluatorMe, getEvaluatorRubric, getEvaluatorSheet, listEvaluatorTeams, requestEvaluatorCode, saveEvaluatorSheet, setEvaluatorPassword, streamEvaluatorPdf } from "../controllers/evaluatorPortalController.js";
import { requireEvaluator } from "../middleware/evaluatorAuthMiddleware.js";
import { getRound2Rubric, getRound2Sheet, listRound2Teams, saveRound2Sheet } from "../controllers/round2PortalController.js";

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
// Round 2 prototypes
router.get("/round2/rubric", getRound2Rubric);
router.get("/round2/teams", listRound2Teams);
router.get("/round2/teams/:id", getRound2Sheet);
router.put("/round2/teams/:id/evaluation", saveRound2Sheet);

export default router;

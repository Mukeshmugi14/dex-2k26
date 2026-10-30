import express from "express";
import { evaluatorLogin, getEvaluatorMe, getEvaluatorRubric, getEvaluatorSheet, listEvaluatorTeams, requestEvaluatorCode, saveEvaluatorSheet, setEvaluatorPassword, streamEvaluatorPdf } from "../controllers/evaluatorPortalController.js";
import { requireEvaluator, requireRound } from "../middleware/evaluatorAuthMiddleware.js";
import { getRound2Rubric, getRound2Sheet, listRound2Teams, saveRound2Sheet } from "../controllers/round2PortalController.js";

// Evaluator Portal API (available on the deployed site; separate from the local-only admin panel).
const router = express.Router();
router.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });

router.post("/auth/login", evaluatorLogin);
router.post("/auth/request-code", requestEvaluatorCode);
router.post("/auth/set-password", setEvaluatorPassword);

router.use(requireEvaluator);
router.get("/me", getEvaluatorMe);

// Round 1 PPTs: Round 1 evaluators only.
const round1 = requireRound("ROUND1");
router.get("/rubric", round1, getEvaluatorRubric);
router.get("/teams", round1, listEvaluatorTeams);
router.get("/teams/:id", round1, getEvaluatorSheet);
router.get("/teams/:id/pdf", round1, streamEvaluatorPdf);
router.put("/teams/:id/evaluation", round1, saveEvaluatorSheet);

// Round 2 prototypes: Round 2 evaluators only.
const round2 = requireRound("ROUND2");
router.get("/round2/rubric", round2, getRound2Rubric);
router.get("/round2/teams", round2, listRound2Teams);
router.get("/round2/teams/:id", round2, getRound2Sheet);
router.put("/round2/teams/:id/evaluation", round2, saveRound2Sheet);

export default router;

import mongoose from "mongoose";
import Evaluator, { evaluatorRounds } from "../models/Evaluator.js";
import { verifyEvaluatorSession } from "../services/evaluatorAuth.js";

const SIGN_IN = { success: false, message: "Please sign in to the Evaluator Portal." };

// Every request re-checks the account: it must still exist, be active, and the session must match its sessionVersion.
export const requireEvaluator = async (request, response, next) => {
  const payload = verifyEvaluatorSession(request.headers.authorization?.split(" ")[1]);
  if (!payload || !mongoose.isValidObjectId(payload.sub)) return response.status(401).json(SIGN_IN);
  const evaluator = await Evaluator.findById(payload.sub, "email username name active sessionVersion rounds").lean();
  if (!evaluator || evaluator.active === false || (evaluator.sessionVersion || 0) !== payload.v) return response.status(401).json(SIGN_IN);
  request.evaluator = { id: String(evaluator._id), email: evaluator.email, username: evaluator.username || "", name: evaluator.name || "", rounds: evaluatorRounds(evaluator) };
  return next();
};

// Only evaluators given this round (ROUND1 / ROUND2) can use its pages.
export const requireRound = (round) => (request, response, next) => (request.evaluator?.rounds?.includes(round)
  ? next()
  : response.status(403).json({ success: false, wrongRound: true, message: `Your account isn't set up for ${round === "ROUND2" ? "Round 2" : "Round 1"} evaluation.` }));

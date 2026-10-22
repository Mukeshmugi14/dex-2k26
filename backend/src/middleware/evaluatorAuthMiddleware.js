import mongoose from "mongoose";
import Evaluator from "../models/Evaluator.js";
import { verifyEvaluatorSession } from "../services/evaluatorAuth.js";

const SIGN_IN = { success: false, message: "Please sign in to the Evaluator Portal." };

// Every request re-checks the account: it must still exist, be active, and the session must match its sessionVersion.
export const requireEvaluator = async (request, response, next) => {
  const payload = verifyEvaluatorSession(request.headers.authorization?.split(" ")[1]);
  if (!payload || !mongoose.isValidObjectId(payload.sub)) return response.status(401).json(SIGN_IN);
  const evaluator = await Evaluator.findById(payload.sub, "email name active sessionVersion").lean();
  if (!evaluator || evaluator.active === false || (evaluator.sessionVersion || 0) !== payload.v) return response.status(401).json(SIGN_IN);
  request.evaluator = { id: String(evaluator._id), email: evaluator.email, name: evaluator.name || "" };
  return next();
};

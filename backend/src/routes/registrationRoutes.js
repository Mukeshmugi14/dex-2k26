import { Router } from "express";
import { createRegistration, getRegistration } from "../controllers/registrationController.js";

const router = Router();
router.post("/", createRegistration);
router.get("/:id", getRegistration);
export default router;

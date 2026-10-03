import { Router } from "express";
import { createRegistration, getRegistration, getRegistrationLogo } from "../controllers/registrationController.js";

const router = Router();
router.post("/", createRegistration);
router.get("/:id/logo", getRegistrationLogo);
router.get("/:id", getRegistration);
export default router;

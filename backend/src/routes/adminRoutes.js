import { Router } from "express";
import { confirmPayment, getDashboard, getFaculty, getPayments, getRegistrations, login, resendPaymentConfirmationEmail, updateRegistration } from "../controllers/adminController.js";
import { updatePaymentSettings } from "../controllers/paymentSettingsController.js";
import { requireAdmin } from "../middleware/authMiddleware.js";

const router = Router();
router.post("/login", login);
router.use(requireAdmin);
router.get("/dashboard", getDashboard);
router.get("/registrations", getRegistrations);
router.put("/registrations/:id", updateRegistration);
router.get("/payments", getPayments);
router.get("/payment-history", getPayments);
router.put("/payments/:id/confirm", confirmPayment);
router.post("/payments/:id/resend-email", resendPaymentConfirmationEmail);
router.get("/faculty", getFaculty);
router.put("/payment-settings", updatePaymentSettings);
export default router;

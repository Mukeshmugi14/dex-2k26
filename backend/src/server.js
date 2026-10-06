import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import adminRoutes from "./routes/adminRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import registrationRoutes from "./routes/registrationRoutes.js";
import submissionRoutes from "./routes/submissionRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";
import { seedAdmin } from "./utils/seedAdmin.js";
import { verifyEmailTransport } from "./services/emailService.js";

const app = express();

// CLIENT_URL / FRONTEND_URL may each hold one or more comma-separated origins.
const allowedOrigins = [process.env.CLIENT_URL, process.env.FRONTEND_URL]
  .flatMap((value) => (value || "").split(","))
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
  credentials: true,
  // Let browsers cache the CORS preflight (OPTIONS) so authorised admin requests don't each cost an extra round trip.
  maxAge: 7200,
}));
app.use(express.json({ limit: "4mb" }));
app.use("/uploads", express.static("uploads"));

app.get("/api/health", (_request, response) => response.json({ ok: true, success: true, message: "DEXATHON backend is running", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));
app.use("/api/registrations", registrationRoutes);
app.use("/api/payment", paymentRoutes);
app.get("/api/payment-settings", (request, response, next) => import("./controllers/paymentSettingsController.js").then(({ getPaymentSettings }) => getPaymentSettings(request, response)).catch(next));
app.get("/api/payment-settings/qr", (request, response, next) => import("./controllers/paymentSettingsController.js").then(({ getPaymentQr }) => getPaymentQr(request, response)).catch(next));
app.use("/api/submissions", submissionRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/admin", adminRoutes);

app.use((error, request, response, _next) => {
  console.error(`Unhandled API error on ${request.method} ${request.originalUrl}:`, error);
  const status = error.status || 500;
  // Client errors keep their message; server errors only reveal details outside production.
  const message = status < 500 ? error.message : "An unexpected server error occurred. Please try again.";
  response.status(status).json({ success: false, message, ...(process.env.NODE_ENV === "production" ? {} : { error: error.message }) });
});

mongoose
  .connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  .then(async () => {
    await seedAdmin();
    verifyEmailTransport();
    const port = process.env.PORT || 5000;
    app.listen(port, "0.0.0.0", () => console.log(`DEXATHON API running on port ${port}. Allowed origins: ${allowedOrigins.join(", ") || "(none)"}`));
  })
  .catch((error) => {
    console.error(`Database connection failed: ${error.message}`);
    process.exit(1);
  });

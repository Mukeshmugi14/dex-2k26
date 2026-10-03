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
}));
app.use(express.json({ limit: "4mb" }));
app.use("/uploads", express.static("uploads"));

app.get("/api/health", (_request, response) => response.json({ ok: true, success: true, message: "DEXATHON backend is running", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));
app.use("/api/registrations", registrationRoutes);
app.use("/api/payment", paymentRoutes);
app.get("/api/payment-settings", (request, response, next) => import("./controllers/paymentSettingsController.js").then(({ getPaymentSettings }) => getPaymentSettings(request, response)).catch(next));
app.use("/api/submissions", submissionRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/admin", adminRoutes);

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.status || 500).json({ message: error.message || "An unexpected error occurred." });
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

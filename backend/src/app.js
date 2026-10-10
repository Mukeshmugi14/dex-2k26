import "dotenv/config";
import cors from "cors";
import express from "express";
import { connectDB } from "./config/db.js";
import adminRoutes from "./routes/adminRoutes.js";
import registrationRoutes from "./routes/registrationRoutes.js";
import submissionRoutes from "./routes/submissionRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";

const app = express();

const PRODUCTION_ORIGINS = [
  "https://dexathon.in",
  "https://www.dexathon.in",
  "https://dexathonwebsite2026.vercel.app",
];

const allowedOrigins = [
  ...new Set([
    ...PRODUCTION_ORIGINS,
    ...[process.env.CLIENT_URL, process.env.FRONTEND_URL]
      .flatMap((value) => (value || "").split(","))
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  ]),
];

app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production"),
    credentials: true,
    maxAge: 7200,
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Ensure DB connection for all requests (works seamlessly on Vercel serverless + local)
app.use(async (_req, _res, next) => {
  await connectDB();
  next();
});

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    success: true,
    message: "DEXATHON backend is running",
    database: connectDB ? "connected" : "disconnected",
  })
);

app.use("/api/registrations", registrationRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/admin", adminRoutes);

app.use((error, request, response, _next) => {
  console.error(`Unhandled API error on ${request.method} ${request.originalUrl}:`, error);
  const status = error.status || 500;
  const message = status < 500 ? error.message : "An unexpected server error occurred. Please try again.";
  response
    .status(status)
    .json({ success: false, message, ...(process.env.NODE_ENV === "production" ? {} : { error: error.message }) });
});

export default app;

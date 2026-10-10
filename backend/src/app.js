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
  "https://dexathon.vercel.app",
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

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (process.env.NODE_ENV !== "production") return true;
  if (allowedOrigins.includes(origin)) return true;
  // Automatically allow all *.vercel.app deployments (production + preview domains)
  if (/^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i.test(origin)) return true;
  // Automatically allow all *.dexathon.in domains
  if (/^https:\/\/([a-z0-9-]+\.)*dexathon\.in$/i.test(origin)) return true;
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
    maxAge: 7200,
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Health and diagnostics endpoint (before DB middleware so it always responds even if DB is down)
const handleHealthCheck = async (_req, res) => {
  let dbStatus = "disconnected";
  let dbError = null;
  const hasUri = Boolean(
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    process.env.mongo_uri ||
    process.env.mongodb_uri
  );

  if (!hasUri) {
    dbStatus = "missing_env_var";
    dbError = "MONGO_URI is not configured in Vercel environment variables.";
  } else {
    try {
      await connectDB();
      dbStatus = "connected";
    } catch (err) {
      dbStatus = "error";
      dbError = err.message;
    }
  }

  return res.json({
    ok: dbStatus === "connected",
    success: true,
    message: "DEXATHON backend is running",
    database: dbStatus,
    dbError,
    hasMongoUri: hasUri,
    hasJwtSecret: Boolean(process.env.JWT_SECRET || process.env.jwt_secret),
    hasEmailUser: Boolean(process.env.EMAIL_USER || process.env.email_user),
    environment: process.env.NODE_ENV || "development",
  });
};

app.get("/api/health", handleHealthCheck);
app.get("/health", handleHealthCheck);

// Ensure DB connection for all subsequent API requests
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// Dual-mount routes (with and without /api) to guarantee compatibility with all Vercel rewrite patterns
app.use("/api/registrations", registrationRoutes);
app.use("/registrations", registrationRoutes);

app.use("/api/submissions", submissionRoutes);
app.use("/submissions", submissionRoutes);

app.use("/api/team", teamRoutes);
app.use("/team", teamRoutes);

app.use("/api/admin", adminRoutes);
app.use("/admin", adminRoutes);

// Error handler
app.use((error, request, response, _next) => {
  console.error(`Unhandled API error on ${request.method} ${request.originalUrl}:`, error);
  const status = error.status || 500;
  // Always return the actual error message so database and config errors are clearly visible
  const message = error.message || "An unexpected server error occurred. Please try again.";
  response.status(status).json({
    success: false,
    message,
    status,
    ...(process.env.NODE_ENV === "production" ? {} : { stack: error.stack }),
  });
});

export default app;

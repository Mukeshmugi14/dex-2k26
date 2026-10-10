import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDB } from "./config/db.js";
import adminRoutes from "./routes/adminRoutes.js";
import registrationRoutes from "./routes/registrationRoutes.js";
import submissionRoutes from "./routes/submissionRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  // Automatically allow all *.onrender.com deployments
  if (/^https:\/\/([a-z0-9-]+\.)*onrender\.com$/i.test(origin)) return true;
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
    dbError = "MONGO_URI is not configured in environment variables.";
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

// Check if a built React frontend exists in dist or frontend/dist
const candidateDistDirs = [
  path.resolve(__dirname, "../../dist"),
  path.resolve(__dirname, "../../frontend/dist"),
];
const staticDir = candidateDistDirs.find((dir) => fs.existsSync(path.join(dir, "index.html")));

if (staticDir) {
  // If static React build exists on Render/server, serve it!
  app.use(express.static(staticDir));
}

// Friendly root landing for the API service (prevents "Cannot GET /" when visiting backend on Render)
app.get("/", (req, res, next) => {
  if (staticDir) {
    return res.sendFile(path.join(staticDir, "index.html"));
  }

  const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"));
  if (wantsJson) {
    return res.json({
      ok: true,
      success: true,
      name: "DEXATHON 2026 API Server",
      status: "online",
      frontendUrl: "https://dexathon.vercel.app",
      teamLoginUrl: "https://dexathon.vercel.app/team-login",
      healthCheck: "/api/health",
    });
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DEXATHON 2026 — API Server</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #071224; color: #ffffff; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #0c1c36; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 14px; padding: 40px 32px; max-width: 520px; width: 100%; text-align: center; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5); }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(34, 197, 94, 0.15); border: 1px solid #22c55e; color: #4ade80; padding: 6px 14px; border-radius: 30px; font-size: 12px; font-weight: 700; letter-spacing: 1px; margin-bottom: 20px; }
    h1 { font-size: 32px; font-weight: 900; letter-spacing: 1px; margin-bottom: 10px; color: #ffffff; }
    h1 span { color: #ff5a1f; }
    p { font-size: 15px; line-height: 1.6; color: #94a3b8; margin-bottom: 28px; }
    .buttons { display: flex; flex-direction: column; gap: 10px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 13px 20px; border-radius: 8px; font-weight: 700; font-size: 14px; text-decoration: none; transition: 0.2s ease; }
    .btn-primary { background: #ff5a1f; color: #ffffff; box-shadow: 0 6px 20px rgba(255, 90, 31, 0.35); }
    .btn-primary:hover { background: #ff733d; }
    .btn-secondary { background: rgba(255, 255, 255, 0.08); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1); }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.15); color: #ffffff; }
    .meta { font-size: 11px; color: #64748b; margin-top: 24px; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="status-badge">&#9679; API SERVICE ACTIVE</div>
    <h1>DE<span>X</span>ATHON 2026</h1>
    <p>This is the backend API service running on Render. Access the full team portal, registrations, and dashboard on Vercel:</p>
    <div class="buttons">
      <a href="https://dexathon.vercel.app/team-login" class="btn btn-primary" target="_blank">Open Team Portal &rarr;</a>
      <a href="/api/health" class="btn btn-secondary">Check API Health &amp; Diagnostics</a>
    </div>
    <div class="meta">&copy; 2026 DEXATHON &bull; Sathyabama Institute of Science and Technology</div>
  </div>
</body>
</html>`);
});

// Ensure DB connection for all subsequent API requests
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// Dual-mount routes (with and without /api) to guarantee compatibility with all platforms
app.use("/api/registrations", registrationRoutes);
app.use("/registrations", registrationRoutes);

app.use("/api/submissions", submissionRoutes);
app.use("/submissions", submissionRoutes);

app.use("/api/team", teamRoutes);
app.use("/team", teamRoutes);

app.use("/api/admin", adminRoutes);
app.use("/admin", adminRoutes);

// SPA fallback for static frontend (if hosted on the same server)
if (staticDir) {
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path === "/health") {
      return next();
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

// Error handler
app.use((error, request, response, _next) => {
  console.error(`Unhandled API error on ${request.method} ${request.originalUrl}:`, error);
  const status = error.status || 500;
  const message = error.message || "An unexpected server error occurred. Please try again.";
  response.status(status).json({
    success: false,
    message,
    status,
    ...(process.env.NODE_ENV === "production" ? {} : { stack: error.stack }),
  });
});

export default app;

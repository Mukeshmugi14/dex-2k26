// Backend API base URL.
// Uses VITE_API_URL if set; otherwise defaults to "/api" (relative path for unified Vercel deployment).
const configuredUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

export const API_URL = configuredUrl
  ? (configuredUrl.endsWith("/api") ? configuredUrl : `${configuredUrl}/api`)
  : "/api";

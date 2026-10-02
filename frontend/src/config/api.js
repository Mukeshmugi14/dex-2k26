// Backend API base URL, e.g. https://sist-website.onrender.com/api.
// Accepts VITE_API_URL with or without the trailing "/api".
const configuredUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

if (!configuredUrl) console.error("VITE_API_URL is not set; API requests will fail.");

export const API_URL = configuredUrl && !configuredUrl.endsWith("/api") ? `${configuredUrl}/api` : configuredUrl;

// Backend API base URL, e.g. https://sist-website.onrender.com/api.
// Accepts VITE_API_URL with or without the trailing "/api".
const configuredUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

if (!configuredUrl) console.error("VITE_API_URL is not set; API requests will fail.");
// A production build must call the deployed backend (Render), never a local address.
if (import.meta.env.PROD && /^\/|localhost|127\.0\.0\.1|192\.168\.|\b10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\./.test(configuredUrl)) {
  console.error(`VITE_API_URL is "${configuredUrl}" in a production build. Set it to the Render backend URL (e.g. https://sathyabama-website.onrender.com/api) in Vercel → Settings → Environment Variables and redeploy.`);
}

export const API_URL = configuredUrl && !configuredUrl.endsWith("/api") ? `${configuredUrl}/api` : configuredUrl;

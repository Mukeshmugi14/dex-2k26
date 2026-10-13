// The admin API works only on a locally run backend, for requests from the same computer.
// On any hosted deployment (Vercel, Render, …) every /api/admin request gets 404, so the admin panel
// can't be reached from the internet even by calling the API directly.

// Environment variables set by common hosting platforms.
const HOSTED = ["VERCEL", "RENDER", "RAILWAY_ENVIRONMENT", "FLY_APP_NAME", "DYNO", "K_SERVICE", "AWS_LAMBDA_FUNCTION_NAME", "NETLIFY"];
export const isHostedDeployment = () => HOSTED.some((name) => process.env[name]);

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

// Uses the real TCP peer, not headers (which a caller can fake). A request relayed by a proxy carries
// forwarding headers, so those are refused too unless they also say loopback.
const isLocalRequest = (request) => {
  if (!LOOPBACK.has(request.socket?.remoteAddress || "")) return false;
  const forwarded = [request.headers["x-forwarded-for"], request.headers["x-real-ip"]].filter(Boolean).join(",");
  return !forwarded || forwarded.split(",").every((ip) => LOOPBACK.has(ip.trim()));
};

export const localAdminOnly = (request, response, next) => {
  if (!isHostedDeployment() && isLocalRequest(request)) return next();
  return response.status(404).json({ success: false, message: "Not found." });
};

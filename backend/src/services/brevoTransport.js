// Brevo transactional email API client (HTTPS). The only way this backend sends email.
// Settings come only from backend environment variables (never sent to the frontend, never logged):
//   BREVO_API_KEY       Brevo API key (Brevo → SMTP & API → API keys)
//   BREVO_SENDER_EMAIL  a sender address verified in Brevo (Brevo → Senders, domains & dedicated IPs)
//   BREVO_SENDER_NAME   display name (default "DEXATHON 2026")
const SEND_URL = "https://api.brevo.com/v3/smtp/email";
const ACCOUNT_URL = "https://api.brevo.com/v3/account";
const SENDERS_URL = "https://api.brevo.com/v3/senders";

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
export const brevoConfigured = () => Boolean((process.env.BREVO_API_KEY || "").trim());
export const brevoSender = () => ({ email: (process.env.BREVO_SENDER_EMAIL || "").trim(), name: (process.env.BREVO_SENDER_NAME || "").trim() || "DEXATHON 2026" });

const brevoError = (message, responseCode = null, code = "EBREVO") => Object.assign(new Error(message), { code, responseCode });

const request = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, headers: { accept: "application/json", "api-key": process.env.BREVO_API_KEY.trim(), ...(options.headers || {}) }, signal: controller.signal });
  } catch (error) {
    throw brevoError(`Could not reach Brevo: ${error.name === "AbortError" ? "timed out" : error.message}`, null, "ETIMEDOUT");
  } finally {
    clearTimeout(timer);
  }
};

export const assertBrevoConfigured = () => {
  if (!brevoConfigured()) throw brevoError("Brevo is not configured. Set BREVO_API_KEY in the backend environment.", null, "EBREVOCONFIG");
  if (!isEmail(brevoSender().email)) throw brevoError("Brevo is not configured. Set BREVO_SENDER_EMAIL to a sender verified in Brevo.", null, "EBREVOCONFIG");
};

// Brevo error bodies look like { code: "unauthorized", message: "Key not found" }.
const readError = async (response) => {
  const body = await response.json().catch(() => ({}));
  return [body.code, body.message].filter(Boolean).join(": ") || response.statusText || `HTTP ${response.status}`;
};

// Checks the API key, that this server's IP is allowed, and that BREVO_SENDER_EMAIL is an active sender.
export const verifyBrevo = async () => {
  assertBrevoConfigured();
  const account = await request(ACCOUNT_URL, { method: "GET" }, 15_000);
  if (!account.ok) throw brevoError(`Brevo rejected the request: ${await readError(account)}`, account.status);
  const senders = await request(SENDERS_URL, { method: "GET" }, 15_000);
  if (senders.ok) {
    const list = (await senders.json().catch(() => ({}))).senders || [];
    const match = list.find((sender) => String(sender.email).toLowerCase() === brevoSender().email.toLowerCase());
    if (!match) throw brevoError(`Brevo sender ${brevoSender().email} is not added in Brevo (Senders, domains & dedicated IPs).`, 400, "EBREVOSENDER");
    if (match.active === false) throw brevoError(`Brevo sender ${brevoSender().email} is not verified yet. Confirm it from the email Brevo sent to that address.`, 400, "EBREVOSENDER");
  }
  return true;
};

// Sends one email. Resolves only when Brevo accepted it (HTTP 2xx) and returns Brevo's message ID.
export const sendWithBrevo = async ({ to, subject, html, text }) => {
  assertBrevoConfigured();
  const payload = {
    sender: brevoSender(),
    to: [{ email: to }],
    subject,
    ...(html ? { htmlContent: html } : {}),
    ...(text ? { textContent: text } : {}),
  };
  const response = await request(SEND_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }, 30_000);
  if (!response.ok) throw brevoError(`Brevo rejected the email (HTTP ${response.status}): ${await readError(response)}`, response.status);
  const data = await response.json().catch(() => ({}));
  return { messageId: data.messageId || null, status: response.status };
};

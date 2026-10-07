// Sends email through the Gmail API over HTTPS (port 443) instead of SMTP.
// Hosts such as Render's free plan block outgoing SMTP ports, but allow HTTPS.
// Credentials come only from environment variables:
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN (OAuth, scope gmail.send)
//   EMAIL_USER (the Gmail address that authorized the refresh token; used as the sender)
import MailComposer from "nodemailer/lib/mail-composer/index.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export const gmailApiConfigured = () => Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);

const apiError = (message, code, responseCode = null) => Object.assign(new Error(message), { code, responseCode });

const request = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    throw apiError(`Gmail API request failed: ${error.name === "AbortError" ? "timed out" : error.message}`, "ETIMEDOUT");
  } finally {
    clearTimeout(timer);
  }
};

// Short-lived access token from the long-lived refresh token, reused until shortly before it expires.
let cachedToken = { value: null, expiresAt: 0 };
const getAccessToken = async () => {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;
  const response = await request(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  }, 15_000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw apiError(`Gmail API sign-in failed: ${data.error || response.status}${data.error_description ? ` (${data.error_description})` : ""}`, "EGMAILAUTH", response.status);
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.value;
};

// Builds the same MIME message nodemailer would send (HTML, text, inline poster image, UTF-8 subject).
const buildMessage = (options) => new Promise((resolve, reject) => {
  new MailComposer(options).compile().build((error, message) => (error ? reject(error) : resolve(message)));
});

// Same interface as a nodemailer transport (sendMail / verify), so the email functions don't change.
export const createGmailApiTransport = () => ({
  async verify() {
    await getAccessToken();
    return true;
  },
  async sendMail(options) {
    const message = await buildMessage(options);
    const token = await getAccessToken();
    const response = await request(SEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: message.toString("base64url") }),
    }, 30_000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) cachedToken = { value: null, expiresAt: 0 };
      throw apiError(`Gmail API send failed: ${data.error?.message || response.status}`, [401, 403].includes(response.status) ? "EGMAILAUTH" : "EGMAILSEND", response.status);
    }
    const recipients = [].concat(options.to || []).map(String);
    return { accepted: recipients, rejected: [], messageId: data.id, response: `Gmail API accepted message ${data.id}` };
  },
});

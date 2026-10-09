// Central email service. Every transactional email is sent through the Brevo API (HTTPS) from this backend.
// There is no SMTP or other provider: the browser never sends email and never sees the Brevo key.
import { buildPaymentConfirmationEmail, POSTER_CID } from "../templates/paymentConfirmationEmail.js";
import { buildSelectionEmail } from "../templates/resultEmail.js";
import { buildRoundResultEmail } from "../templates/roundResultEmail.js";
import { buildRoundUpdateEmail } from "../templates/roundUpdateEmail.js";
import { getTeamLoginUrl, getTeamPortalPassword } from "./submissionService.js";
import { brevoConfigured, brevoSender, sendWithBrevo, verifyBrevo } from "./brevoTransport.js";

// Team Head Portal login details included in team emails (the email address itself comes from each team record).
const portalAccess = () => ({ loginUrl: getTeamLoginUrl(), password: getTeamPortalPassword() });

export const emailProvider = () => "brevo";

// Brevo cannot embed images, so the poster is loaded from a public URL (override with EMAIL_POSTER_URL).
const DEFAULT_POSTER_URL = "https://raw.githubusercontent.com/Sudhar6424/sathyabama-website/main/backend/src/assets/dexathon-2026-poster.jpg";
const posterUrl = () => (process.env.EMAIL_POSTER_URL || "").trim() || DEFAULT_POSTER_URL;

// The recipient always comes from the team's registration record (Team Head email); never hardcoded.
const getRecipientEmail = (registration) => {
  const recipientEmail = registration?.leader?.email?.trim();
  if (!recipientEmail) throw Object.assign(new Error("The team leader email is missing from this registration."), { code: "ENORECIPIENT" });
  return recipientEmail;
};

// The one place that sends: logs start/success/failure (recipient, type, message ID only — never secrets).
const sendEmail = async ({ type, to, subject, html, text }) => {
  console.log(`EMAIL_SEND_START type=${type} to=${to}`);
  try {
    const { messageId } = await sendWithBrevo({ to, subject, html, text });
    console.log(`EMAIL_SEND_SUCCESS type=${type} to=${to} messageId=${messageId || "n/a"}`);
    return { sent: true, messageId };
  } catch (error) {
    console.error(`EMAIL_SEND_FAILED type=${type} to=${to} status=${error.responseCode ?? "-"} reason="${describeEmailError(error)}" detail="${error.message}"`);
    throw error;
  }
};

// Payment confirmation (admin verified the payment). Resolves { sent, messageId } only after Brevo accepted it.
export const sendPaymentConfirmationEmail = async (registration) => {
  const to = getRecipientEmail(registration);
  const { html, text } = buildPaymentConfirmationEmail(registration, { portal: portalAccess() });
  return sendEmail({
    type: "payment-confirmation",
    to,
    subject: "DEXATHON 2026 — Payment Confirmed ✓",
    html: html.split(`cid:${POSTER_CID}`).join(posterUrl()),
    text,
  });
};
export const sendPaymentConfirmation = sendPaymentConfirmationEmail;
export const resendConfirmationEmail = sendPaymentConfirmationEmail;

// Plain registration receipt (Razorpay payment flow).
export const sendConfirmationEmail = async (registration) => {
  const to = getRecipientEmail(registration);
  const result = await sendEmail({
    type: "registration-receipt",
    to,
    subject: "DEXATHON 2026 Registration Confirmation",
    text: `DEXATHON 2026 Registration Successful\n\nTeam Name: ${registration.teamName}\nTeam ID: ${registration.teamId}\nRegistration Number: ${registration.registrationNumber}\nAmount Paid: ₹${registration.payment.amount}\nTransaction ID: ${registration.payment.transactionId}\nPayment Status: ${registration.payment.status}\nUPI ID: ${registration.payment.upiId || "Razorpay"}\nRegistration Date: ${registration.createdAt.toLocaleDateString()}`,
  });
  return result.sent;
};

// Second-round selection after the Round 1 PDF evaluation. Returns true only when Brevo accepted it.
export const sendSelectionEmail = async (registration) => {
  const to = getRecipientEmail(registration);
  const { subject, html, text } = buildSelectionEmail(registration);
  return (await sendEmail({ type: "round2-selection", to, subject, html, text })).sent;
};

// Round progress update. Returns true only when Brevo accepted it.
export const sendRoundUpdateEmail = async (registration, rounds) => {
  const to = getRecipientEmail(registration);
  const { subject, html, text } = buildRoundUpdateEmail(registration, rounds, portalAccess());
  return (await sendEmail({ type: "round-update", to, subject, html, text })).sent;
};

// Round result (SELECTED / REJECTED for one round). Returns true only when Brevo accepted it.
export const sendRoundResultEmail = async (registration, round, decision) => {
  const to = getRecipientEmail(registration);
  const { subject, html, text } = buildRoundResultEmail(registration, round, decision, portalAccess());
  return (await sendEmail({ type: `round${round}-${String(decision).toLowerCase()}`, to, subject, html, text })).sent;
};
export const sendRound1SelectionEmail = (registration) => sendRoundResultEmail(registration, 1, "SELECTED");
export const sendRound2SelectionEmail = (registration) => sendRoundResultEmail(registration, 2, "SELECTED");
export const sendRejectionEmail = (registration, round) => sendRoundResultEmail(registration, round, "REJECTED");

// Admin test email (POST /api/admin/test-email).
export const sendTestEmail = async (to) => sendEmail({
  type: "admin-test",
  to,
  subject: "DEXATHON 2026 — Email delivery test",
  html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16171b"><h2 style="margin:0 0 8px">DEXATHON 2026</h2><p>This is a test email sent by the DEXATHON backend through the Brevo API.</p><p>If you received it, payment confirmation emails can be delivered.</p></div>`,
  text: "DEXATHON 2026\n\nThis is a test email sent by the DEXATHON backend through the Brevo API.\nIf you received it, payment confirmation emails can be delivered.",
});

// Plain-language reason for a failed send, safe to show to admins (never includes credentials).
export const describeEmailError = (error) => {
  const code = error?.code || "";
  const response = Number(error?.responseCode) || 0;
  const text = String(error?.message || "");
  if (code === "ENORECIPIENT") return "This team has no Team Head email address.";
  if (code === "EBREVOCONFIG") return /SENDER/.test(text)
    ? "Brevo is not configured: set BREVO_SENDER_EMAIL to a sender verified in Brevo."
    : "Brevo is not configured: set BREVO_API_KEY in the backend environment (Render → Environment).";
  if (code === "EBREVOSENDER") return `${text} Brevo only sends from verified senders.`;
  if (code === "ETIMEDOUT") return "Could not reach Brevo. Check the server's internet connection and try again.";
  const blockedIp = text.match(/unrecogni[sz]ed IP address (\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f]*:[0-9a-f:]+)/i);
  if (blockedIp || /authori[sz]ed_?ips/i.test(text)) return `Brevo blocked this server's IP address${blockedIp ? ` (${blockedIp[1]})` : ""}. In Brevo → Security → Authorized IPs, turn off IP blocking (needed for Render, whose IP changes) or add this IP.`;
  if (response === 401) return "Brevo rejected the API key (BREVO_API_KEY). Create a new API key in Brevo → SMTP & API → API keys.";
  if (response === 403) return "Brevo refused the request (account not activated for transactional email). Check your Brevo account status.";
  if (response === 429) return "Brevo rate limit reached. Please try again in a few minutes.";
  if (response >= 500) return "Brevo had a temporary server error. Please try again.";
  if (response === 400 && /sender/i.test(text)) return "Brevo rejected the sender (BREVO_SENDER_EMAIL). Add and verify it in Brevo → Senders, domains & dedicated IPs.";
  if (response === 400 && /email|recipient|to\b/i.test(text)) return "Brevo rejected the recipient email address. Check the Team Head email.";
  if (response === 400) return text.replace(/^Brevo rejected the email \(HTTP 400\): /, "Brevo rejected the email: ");
  return "The email could not be sent. Please try again.";
};

// Startup check: which Brevo settings are present (names only, never the values).
export const logEmailConfiguration = () => {
  const state = (value) => (value && String(value).trim() ? "configured" : "MISSING");
  console.log("Email provider: Brevo API");
  console.log(`  BREVO_API_KEY: ${state(process.env.BREVO_API_KEY)}`);
  console.log(`  BREVO_SENDER_EMAIL: ${state(brevoSender().email)}`);
  console.log(`  BREVO_SENDER_NAME: ${brevoSender().name}`);
  const missing = [["BREVO_API_KEY", brevoConfigured()], ["BREVO_SENDER_EMAIL", Boolean(brevoSender().email)]].filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length) console.error(`Brevo is not fully configured. Missing environment variable(s): ${missing.join(", ")}. Emails will fail until they are set.`);
};

export const verifyEmailTransport = async () => {
  try {
    await verifyBrevo();
    console.log("Email ready (Brevo API)");
    return { ok: true, provider: "brevo" };
  } catch (error) {
    console.error(`Email check failed (Brevo): ${error.code || ""} ${error.responseCode || ""} ${describeEmailError(error)}`);
    return { ok: false, provider: "brevo", code: error.code || null, reason: describeEmailError(error) };
  }
};

// Cached health check for the admin panel (a real Brevo API call, at most once a minute).
let emailHealth = { checkedAt: 0, result: null };
export const getEmailHealth = async () => {
  if (emailHealth.result && Date.now() - emailHealth.checkedAt < 60_000) return emailHealth.result;
  const result = await verifyEmailTransport();
  emailHealth = { checkedAt: Date.now(), result };
  return result;
};
export const resetEmailHealth = () => { emailHealth = { checkedAt: 0, result: null }; };
// A real send just succeeded, so email is healthy right now.
export const markEmailHealthy = () => { emailHealth = { checkedAt: Date.now(), result: { ok: true, provider: "brevo" } }; };

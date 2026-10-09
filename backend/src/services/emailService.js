// Central email service. Every transactional email is sent through Gmail SMTP from this backend.
// There is no other provider: the browser never sends email and never sees the Gmail credentials.
import { buildPaymentConfirmationEmail, POSTER_CID, POSTER_IMAGE_PATH } from "../templates/paymentConfirmationEmail.js";
import { buildSelectionEmail } from "../templates/resultEmail.js";
import { buildRoundResultEmail } from "../templates/roundResultEmail.js";
import { buildRoundUpdateEmail } from "../templates/roundUpdateEmail.js";
import { getTeamLoginUrl, getTeamPortalPassword } from "./submissionService.js";
import { CONNECTION_ERRORS, lastSmtpProbe, probeSmtpPorts, sendWithSmtp, smtpConfigured, smtpUser, verifySmtp } from "./smtpTransport.js";

// Team Head Portal login details included in team emails (the email address itself comes from each team record).
const portalAccess = () => ({ loginUrl: getTeamLoginUrl(), password: getTeamPortalPassword() });

export const emailProvider = () => "gmail-smtp";

// The recipient always comes from the team's registration record (Team Head email); never hardcoded.
const getRecipientEmail = (registration) => {
  const recipientEmail = registration?.leader?.email?.trim();
  if (!recipientEmail) throw Object.assign(new Error("The team leader email is missing from this registration."), { code: "ENORECIPIENT" });
  return recipientEmail;
};

// The one place that sends: logs start/success/failure (recipient, type, message ID only — never secrets).
const sendEmail = async ({ type, to, subject, html, text, attachments }) => {
  console.log(`EMAIL_SEND_START type=${type} to=${to}`);
  try {
    const { messageId } = await sendWithSmtp({ to, subject, html, text, attachments });
    console.log(`EMAIL_SEND_SUCCESS type=${type} to=${to} messageId=${messageId || "n/a"}`);
    return { sent: true, messageId };
  } catch (error) {
    if (CONNECTION_ERRORS.has(error.code)) await probeSmtpPorts().catch(() => null);
    console.error(`EMAIL_SEND_FAILED type=${type} to=${to} code=${error.code || "-"} status=${error.responseCode ?? "-"} reason="${describeEmailError(error)}"`);
    throw error;
  }
};

// Payment confirmation (admin verified the payment). Resolves { sent, messageId } only after Gmail accepted it.
export const sendPaymentConfirmationEmail = async (registration) => {
  const to = getRecipientEmail(registration);
  const { html, text } = buildPaymentConfirmationEmail(registration, { portal: portalAccess() });
  return sendEmail({
    type: "payment-confirmation",
    to,
    subject: "DEXATHON 2026 — Payment Confirmed ✓",
    html,
    text,
    // The poster is embedded in the email (cid:) so it shows without loading external images.
    attachments: [{ filename: "dexathon-2026-poster.jpg", path: POSTER_IMAGE_PATH, cid: POSTER_CID }],
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

// Second-round selection after the Round 1 PDF evaluation. Returns true only when Gmail accepted it.
export const sendSelectionEmail = async (registration) => {
  const to = getRecipientEmail(registration);
  const { subject, html, text } = buildSelectionEmail(registration);
  return (await sendEmail({ type: "round2-selection", to, subject, html, text })).sent;
};

// Round progress update. Returns true only when Gmail accepted it.
export const sendRoundUpdateEmail = async (registration, rounds) => {
  const to = getRecipientEmail(registration);
  const { subject, html, text } = buildRoundUpdateEmail(registration, rounds, portalAccess());
  return (await sendEmail({ type: "round-update", to, subject, html, text })).sent;
};

// Round result (SELECTED / REJECTED for one round). Returns true only when Gmail accepted it.
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
  html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16171b"><h2 style="margin:0 0 8px">DEXATHON 2026</h2><p>This is a test email sent by the DEXATHON backend through Gmail SMTP.</p><p>If you received it, payment confirmation emails can be delivered.</p></div>`,
  text: "DEXATHON 2026\n\nThis is a test email sent by the DEXATHON backend through Gmail SMTP.\nIf you received it, payment confirmation emails can be delivered.",
});

// Plain-language reason for a failed send, safe to show to admins (never includes credentials).
export const describeEmailError = (error) => {
  const code = error?.code || "";
  const response = Number(error?.responseCode) || 0;
  const text = String(error?.message || "");
  if (code === "ENORECIPIENT") return "This team has no Team Head email address.";
  if (code === "ESMTPCONFIG") return /Gmail address/.test(text)
    ? "Email is not configured: EMAIL_USER must be a Gmail address."
    : "Email is not configured: set EMAIL_USER and EMAIL_PASSWORD in the backend environment.";
  if (code === "EAUTH" || response === 535 || response === 534) return "Gmail rejected the sender login (EMAIL_USER / EMAIL_PASSWORD). Use a Gmail App Password (2-Step Verification must be on), not the normal Gmail password.";
  if (CONNECTION_ERRORS.has(code)) {
    const probe = lastSmtpProbe();
    if (probe?.smtpBlocked) return `The server's hosting provider blocks outbound SMTP: Gmail ports 465 (${probe.smtp465}) and 587 (${probe.smtp587}) are unreachable while HTTPS works. Gmail SMTP cannot send from this host until the hosting plan allows outbound SMTP.`;
    if (probe && probe.https443 !== "open") return "This server has no working internet connection right now (HTTPS also failed). Try again shortly.";
    return "Could not connect to Gmail SMTP (smtp.gmail.com:465). The connection dropped; please try again.";
  }
  if (code === "EENVELOPE" || response === 550 || response === 553) return "Gmail rejected the recipient email address. Check the Team Head email.";
  if (response === 421 || response === 454 || /rate|limit|too many/i.test(text)) return "Gmail sending limit reached. Please try again later.";
  if (response >= 400 && response < 500) return "Gmail had a temporary error. Please try again.";
  return "The email could not be sent. Please try again.";
};

// Startup check: which email settings are present (names only, never the values).
export const logEmailConfiguration = () => {
  const state = (value) => (value && String(value).trim() ? "configured" : "MISSING");
  console.log("Email provider: Gmail SMTP (smtp.gmail.com:465)");
  console.log(`  EMAIL_USER: ${state(smtpUser())}`);
  console.log(`  EMAIL_PASSWORD: ${state(process.env.EMAIL_PASSWORD)}`);
  if (!smtpConfigured()) console.error("Gmail SMTP is not fully configured. Set EMAIL_USER and EMAIL_PASSWORD. Emails will fail until they are set.");
};

export const verifyEmailTransport = async () => {
  try {
    await verifySmtp();
    console.log("Email ready (Gmail SMTP)");
    return { ok: true, provider: emailProvider() };
  } catch (error) {
    const network = CONNECTION_ERRORS.has(error.code) ? await probeSmtpPorts().catch(() => null) : null;
    console.error(`Email check failed (Gmail SMTP): ${error.code || ""} ${error.responseCode || ""} ${describeEmailError(error)}${network ? ` ports=${JSON.stringify(network)}` : ""}`);
    return { ok: false, provider: emailProvider(), code: error.code || null, reason: describeEmailError(error), ...(network ? { network } : {}) };
  }
};

// Cached health check for the admin panel (a real SMTP login, at most once a minute).
let emailHealth = { checkedAt: 0, result: null };
export const getEmailHealth = async () => {
  if (emailHealth.result && Date.now() - emailHealth.checkedAt < 60_000) return emailHealth.result;
  const result = await verifyEmailTransport();
  emailHealth = { checkedAt: Date.now(), result };
  return result;
};
export const resetEmailHealth = () => { emailHealth = { checkedAt: 0, result: null }; };
// A real send just succeeded, so email is healthy right now.
export const markEmailHealthy = () => { emailHealth = { checkedAt: Date.now(), result: { ok: true, provider: emailProvider() } }; };

// Central email service. Every transactional email is sent through Gmail SMTP from this backend.
// There is no other provider: the browser never sends email and never sees the Gmail credentials.
import { buildTeamConfirmationEmail, POSTER_CID, POSTER_IMAGE_PATH } from "../templates/paymentConfirmationEmail.js";
import { buildSelectionEmail } from "../templates/resultEmail.js";
import { buildRoundResultEmail } from "../templates/roundResultEmail.js";
import { buildRoundUpdateEmail } from "../templates/roundUpdateEmail.js";
import { buildRound1ReminderEmail } from "../templates/round1ReminderEmail.js";
import { getEvaluatorLoginUrl, getRound1Deadline, getTeamLoginUrl } from "./submissionService.js";
import { escapeHtml } from "../templates/paymentConfirmationEmail.js";
import { CONNECTION_ERRORS, lastSmtpProbe, probeSmtpPorts, sendWithSmtp, smtpConfigured, smtpUser, verifySmtp } from "./smtpTransport.js";

// Team Login Portal credentials for ONE team, read from that team's own record:
// login = Team Head email, User ID = the team's Team ID, initial password = that same Team ID
// (the login check compares against the stored Team ID, so no password is stored separately).
const portalAccess = (registration) => {
  const teamId = String(registration?.teamId || "").trim();
  if (!teamId) throw Object.assign(new Error("This team has no Team ID yet."), { code: "ENOTEAMID" });
  return {
    teamId,
    teamName: registration.teamName?.trim() || "",
    leaderName: registration.leader?.name?.trim() || "",
    email: registration.leader?.email?.trim() || "",
    password: teamId,
    loginUrl: getTeamLoginUrl(),
  };
};

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

// Preview team registration confirmation email without sending
export const previewTeamConfirmationEmail = (registration) => {
  const to = registration?.leader?.email?.trim() || "";
  const { html, text } = buildTeamConfirmationEmail(registration, { portal: portalAccess(registration) });
  return {
    to,
    subject: "DEXATHON 2026 — Registration Confirmed ✓",
    html,
    text,
  };
};

// Send team registration confirmation email (reusing existing email template with dynamic team variables)
export const sendTeamConfirmationEmail = async (registration) => {
  const to = getRecipientEmail(registration);
  const { html, text } = buildTeamConfirmationEmail(registration, { portal: portalAccess(registration) });
  return sendEmail({
    type: "team-registration-confirmation",
    to,
    subject: "DEXATHON 2026 — Registration Confirmed ✓",
    html,
    text,
    attachments: [{ filename: "dexathon-2026-poster.jpg", path: POSTER_IMAGE_PATH, cid: POSTER_CID }],
  });
};

// Second-round selection after the Round 1 PDF evaluation. Returns true only when Gmail accepted it.
export const sendSelectionEmail = async (registration) => {
  const to = getRecipientEmail(registration);
  const { subject, html, text } = buildSelectionEmail(registration);
  return (await sendEmail({ type: "round2-selection", to, subject, html, text })).sent;
};

// Round progress update. Returns true only when Gmail accepted it.
// Round 1 deadline reminder (submitted / not-submitted versions). Returns the message ID when Gmail accepted it.
export const previewRound1ReminderEmail = (registration) => ({ to: getRecipientEmail(registration), ...buildRound1ReminderEmail(registration, getRound1Deadline(), portalAccess(registration)) });
export const sendRound1ReminderEmail = async (registration) => {
  const { to, subject, html, text } = previewRound1ReminderEmail(registration);
  return sendEmail({ type: "round1-reminder", to, subject, html, text });
};

export const sendRoundUpdateEmail = async (registration, rounds) => {
  const to = getRecipientEmail(registration);
  const { subject, html, text } = buildRoundUpdateEmail(registration, rounds, portalAccess(registration));
  return (await sendEmail({ type: "round-update", to, subject, html, text })).sent;
};

// Round result (SELECTED / REJECTED for one round). Returns true only when Gmail accepted it.
export const sendRoundResultEmail = async (registration, round, decision) => {
  const to = getRecipientEmail(registration);
  const { subject, html, text } = buildRoundResultEmail(registration, round, decision, portalAccess(registration));
  return (await sendEmail({ type: `round${round}-${String(decision).toLowerCase()}`, to, subject, html, text })).sent;
};
export const sendRound1SelectionEmail = (registration) => sendRoundResultEmail(registration, 1, "SELECTED");
export const sendRound2SelectionEmail = (registration) => sendRoundResultEmail(registration, 2, "SELECTED");
export const sendRejectionEmail = (registration, round) => sendRoundResultEmail(registration, round, "REJECTED");

// Admin verification code: "login" (after a correct password) or "setup" (first-time login / forgot password).
// The code is never logged.
export const sendAdminOtpEmail = async (to, code, minutes, purpose = "login") => {
  const setup = purpose === "setup";
  const title = setup ? "Admin Password Setup" : "Admin Login";
  const action = setup ? "set your admin password" : "finish signing in";
  const warning = setup ? "If you did not ask to set or reset your admin password, ignore this email and tell the event team." : "If you did not just try to log in, someone knows your admin password. Do not share this code, and change the password right away.";
  return sendEmail({
    type: setup ? "admin-setup-code" : "admin-login-code",
    to,
    subject: `DEXATHON 2026 admin ${setup ? "password setup" : "login"} code: ${code}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16171b"><h2 style="margin:0 0 8px">DEXATHON 2026 — ${title}</h2><p>Your verification code is:</p><p style="font-size:34px;font-weight:800;letter-spacing:10px;margin:8px 0 16px">${code}</p><p>It expires in ${minutes} minutes. Enter it on the admin login page to ${action}.</p><p style="color:#b42318"><b>${warning}</b></p></div>`,
    text: `DEXATHON 2026 — ${title}\n\nYour verification code is: ${code}\nIt expires in ${minutes} minutes. Enter it on the admin login page to ${action}.\n\n${warning}`,
  });
};

// Evaluator Portal: one-time code for the first sign-in or a password reset.
export const sendEvaluatorCodeEmail = async (to, code, minutes) => sendEmail({
  type: "evaluator-code",
  to,
  subject: `DEXATHON 2026 evaluator code: ${code}`,
  html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16171b"><h2 style="margin:0 0 8px">DEXATHON 2026 — Evaluator Portal</h2><p>Your one-time code is:</p><p style="font-size:34px;font-weight:800;letter-spacing:10px;margin:8px 0 16px">${code}</p><p>It expires in ${minutes} minutes and works once. Enter it on the Evaluator Portal to set your password.</p><p style="color:#b42318"><b>Never share this code. If you didn't ask for it, ignore this email.</b></p></div>`,
  text: `DEXATHON 2026 — Evaluator Portal

Your one-time code is: ${code}
It expires in ${minutes} minutes and works once. Enter it on the Evaluator Portal to set your password.

Never share this code. If you didn't ask for it, ignore this email.`,
});

// Evaluator Portal invitation, sent when an admin adds an evaluator.
export const sendEvaluatorInviteEmail = async (to, name) => {
  const url = getEvaluatorLoginUrl();
  const who = escapeHtml(name || "Evaluator");
  return sendEmail({
    type: "evaluator-invite",
    to,
    subject: "You're invited to evaluate DEXATHON 2026 Round 1 submissions",
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:23px;color:#16171b"><h2 style="margin:0 0 8px">DEXATHON 2026 — Evaluator Portal</h2><p>Dear ${who},</p><p>You have been added as an evaluator for the <b>Round 1 PPT submissions</b> of DEXATHON 2026.</p><ol><li>Open the Evaluator Portal: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li><li>Choose <b>First time / Forgot password</b> and enter this email address (${escapeHtml(to)}).</li><li>Enter the one-time code we email you and set your password.</li></ol><p>After that, sign in any time with this email and your password. Each submission is scored on the official PPT Evaluation Sheet (11 criteria, 100 marks).</p><p>Thank you,<br><b>DEXATHON 2026 Team</b></p></div>`,
    text: `DEXATHON 2026 — Evaluator Portal

Dear ${name || "Evaluator"},

You have been added as an evaluator for the Round 1 PPT submissions of DEXATHON 2026.

1. Open the Evaluator Portal: ${url}
2. Choose "First time / Forgot password" and enter this email address (${to}).
3. Enter the one-time code we email you and set your password.

After that, sign in any time with this email and your password.

Thank you,
DEXATHON 2026 Team`,
  });
};

// Sent after every successful admin login, so the owner notices a login they didn't make.
export const sendAdminLoginAlertEmail = async (to, { when, ip, agent, note = "" }) => {
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return sendEmail({
    type: "admin-login-alert",
    to,
    subject: "DEXATHON 2026: new admin login",
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#16171b"><h2 style="margin:0 0 8px">DEXATHON 2026 — New admin login</h2><p>Your admin account just signed in${note ? ` (${esc(note)})` : ""}.</p><table style="border-collapse:collapse;font-size:14px"><tr><td style="padding:4px 12px 4px 0;color:#5d6b7e">Time</td><td><b>${esc(when)}</b></td></tr><tr><td style="padding:4px 12px 4px 0;color:#5d6b7e">IP address</td><td><b>${esc(ip)}</b></td></tr><tr><td style="padding:4px 12px 4px 0;color:#5d6b7e">Browser</td><td>${esc(agent)}</td></tr></table><p style="color:#b42318"><b>If this wasn't you,</b> change the admin password and JWT_SECRET right away, and check the teams.</p></div>`,
    text: `DEXATHON 2026 — New admin login${note ? ` (${note})` : ""}\n\nTime: ${when}\nIP address: ${ip}\nBrowser: ${agent}\n\nIf this wasn't you, change the admin password and JWT_SECRET right away, and check the teams.`,
  });
};

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
  if (code === "ENOTEAMID") return "This team has no Team ID, so its login credentials cannot be sent.";
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

import nodemailer from "nodemailer";
import { buildPaymentConfirmationEmail, POSTER_CID, POSTER_IMAGE_PATH } from "../templates/paymentConfirmationEmail.js";
import { buildSelectionEmail } from "../templates/resultEmail.js";
import { buildRoundResultEmail } from "../templates/roundResultEmail.js";
import { buildRoundUpdateEmail } from "../templates/roundUpdateEmail.js";
import { getTeamLoginUrl, getTeamPortalPassword } from "./submissionService.js";
import { createGmailApiTransport, gmailApiConfigured } from "./gmailApiTransport.js";

// Team Head Portal login details included in team emails (the email address itself comes from each team record).
const portalAccess = () => ({ loginUrl: getTeamLoginUrl(), password: getTeamPortalPassword() });

// How email is delivered:
//  - "gmail-api": Gmail API over HTTPS. Used automatically when GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET /
//    GMAIL_REFRESH_TOKEN are set. Needed on hosts that block SMTP ports (e.g. Render's free plan).
//  - "smtp": Gmail SMTP with EMAIL_USER + EMAIL_PASSWORD (an App Password). Works locally.
// EMAIL_PROVIDER=smtp or EMAIL_PROVIDER=gmail-api forces one of them.
// The sending Gmail address: GMAIL_USER (preferred) or EMAIL_USER.
export const senderAddress = () => (process.env.GMAIL_USER || process.env.EMAIL_USER || "").trim();
// Render sets RENDER=true. Hosted servers use the Gmail API only (their SMTP ports may be blocked).
const onHostedServer = () => process.env.RENDER === "true" || process.env.NODE_ENV === "production";
export const emailProvider = () => {
  const forced = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (forced === "smtp" || forced === "gmail-api") return forced;
  return gmailApiConfigured() || onHostedServer() ? "gmail-api" : "smtp";
};

// One transport per process (the SMTP one is pooled so the authenticated connection is reused).
let mailer = null;
let mailerKind = null;
const createMailer = () => {
  const kind = emailProvider();
  if (kind === "gmail-api" && (!gmailApiConfigured() || !senderAddress())) throw new Error("Gmail API is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_USER in the backend environment.");
  if (!senderAddress()) throw new Error("Email is not configured. Set GMAIL_USER (or EMAIL_USER) in the backend environment.");
  if (kind === "smtp" && !process.env.EMAIL_PASSWORD) throw new Error("Email is not configured. Set EMAIL_USER and EMAIL_PASSWORD in the backend environment.");
  if (!mailer || mailerKind !== kind) {
    console.log(`Email provider: ${kind} | sender: ${senderAddress()}`);
    mailer = kind === "gmail-api"
      ? createGmailApiTransport()
      : nodemailer.createTransport({
        service: "gmail",
        pool: true,
        maxConnections: 3,
        // Fail fast when the network blocks SMTP, so the admin sees "Failed" + Resend instead of a long "Sending…".
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
        auth: { user: senderAddress(), pass: process.env.EMAIL_PASSWORD },
      });
    mailerKind = kind;
  }
  return mailer;
};

const getRecipientEmail = (registration) => {
  const recipientEmail = registration?.leader?.email?.trim();
  console.log("Recipient Email:", recipientEmail || "(missing)");
  if (!recipientEmail) throw new Error("The team leader email is missing from this registration.");
  return recipientEmail;
};

export const sendConfirmationEmail = async (registration) => {
  const mailer = createMailer();
  const recipientEmail = getRecipientEmail(registration);
  await mailer.sendMail({
    from: senderAddress(),
    to: recipientEmail,
    subject: "DEXATHON 2026 Registration Confirmation",
    text: `DEXATHON 2026 Registration Successful\n\nTeam Name: ${registration.teamName}\nTeam ID: ${registration.teamId}\nRegistration Number: ${registration.registrationNumber}\nAmount Paid: ₹${registration.payment.amount}\nTransaction ID: ${registration.payment.transactionId}\nPayment Status: ${registration.payment.status}\nUPI ID: ${registration.payment.upiId || "Razorpay"}\nRegistration Date: ${registration.createdAt.toLocaleDateString()}`,
  });
};

export const sendPaymentConfirmationEmail = async (registration) => {
  const mailer = createMailer();
  const recipientEmail = getRecipientEmail(registration);
  const { html, text } = buildPaymentConfirmationEmail(registration, { portal: portalAccess() });
  const result = await mailer.sendMail({
    from: senderAddress(),
    to: recipientEmail,
    subject: "DEXATHON 2026 — Payment Confirmed ✓",
    html,
    text,
    attachments: [{ filename: "dexathon-2026-poster.jpg", path: POSTER_IMAGE_PATH, cid: POSTER_CID }],
  });
  const accepted = result.accepted.map((address) => String(address).toLowerCase()).includes(recipientEmail.toLowerCase());
  if (accepted) console.log("Confirmation email sent successfully", { messageId: result.messageId, response: result.response });
  else console.error("Confirmation Email Error: recipient not accepted by SMTP server", { accepted: result.accepted, rejected: result.rejected, response: result.response });
  return accepted;
};

// Second-round selection email to the team head's registered email. Returns true only if the SMTP server accepted it.
export const sendSelectionEmail = async (registration) => {
  const mailer = createMailer();
  const recipientEmail = getRecipientEmail(registration);
  const { subject, html, text } = buildSelectionEmail(registration);
  const sent = await mailer.sendMail({ from: senderAddress(), to: recipientEmail, subject, html, text });
  const accepted = sent.accepted.map((address) => String(address).toLowerCase()).includes(recipientEmail.toLowerCase());
  if (accepted) console.log("Second round selection email sent successfully", { messageId: sent.messageId });
  else console.error("Second Round Email Error: recipient not accepted by SMTP server", { rejected: sent.rejected, response: sent.response });
  return accepted;
};

// Round update email to the team head's registered email. Returns true only if the SMTP server accepted it.
export const sendRoundUpdateEmail = async (registration, rounds) => {
  const mailer = createMailer();
  const recipientEmail = getRecipientEmail(registration);
  const { subject, html, text } = buildRoundUpdateEmail(registration, rounds, portalAccess());
  const sent = await mailer.sendMail({ from: senderAddress(), to: recipientEmail, subject, html, text });
  const accepted = sent.accepted.map((address) => String(address).toLowerCase()).includes(recipientEmail.toLowerCase());
  if (accepted) console.log("Round update email sent successfully", { messageId: sent.messageId });
  else console.error("Round Update Email Error: recipient not accepted by SMTP server", { rejected: sent.rejected, response: sent.response });
  return accepted;
};

// Round Selection result email (Selected / Rejected for a specific round) to the team head's registered email.
export const sendRoundResultEmail = async (registration, round, decision) => {
  const mailer = createMailer();
  const recipientEmail = getRecipientEmail(registration);
  const { subject, html, text } = buildRoundResultEmail(registration, round, decision, portalAccess());
  const sent = await mailer.sendMail({ from: senderAddress(), to: recipientEmail, subject, html, text });
  const accepted = sent.accepted.map((address) => String(address).toLowerCase()).includes(recipientEmail.toLowerCase());
  if (accepted) console.log(`Round ${round} ${decision} email sent successfully`, { messageId: sent.messageId });
  else console.error("Round Result Email Error: recipient not accepted by SMTP server", { rejected: sent.rejected, response: sent.response });
  return accepted;
};

// Plain-language reason for a failed send, safe to show to admins (never includes credentials).
export const describeEmailError = (error) => {
  const code = error?.code || "";
  const response = Number(error?.responseCode) || 0;
  const text = String(error?.message || "");
  if (/Gmail API is not configured/i.test(text)) return "Gmail API is not configured on the server. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_USER to the backend environment variables (Render → Environment).";
  if (/not configured/i.test(text)) return "Email is not configured on the server. Set the email environment variables (see the server log).";
  if (code === "EGMAILAUTH") return /invalid_grant/i.test(text)
    ? "Gmail API refresh token is expired or revoked. Create a new GMAIL_REFRESH_TOKEN in the server settings."
    : "Gmail API sign-in failed. Check GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN in the server settings.";
  if (code === "EGMAILSEND") return "Gmail API refused the message. Check that GMAIL_USER is the Gmail account that authorized the refresh token.";
  if (code === "EAUTH" || response === 535 || response === 534) return "Gmail rejected the sender login (EMAIL_USER / EMAIL_PASSWORD). The Gmail App Password needs to be renewed in the server settings.";
  if (/leader email is missing/i.test(text)) return "This team has no Team Head email address.";
  if (code === "EENVELOPE" || [550, 551, 553].includes(response)) return "The team's email address was rejected. Check the Team Head email.";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET"].includes(code)) return emailProvider() === "smtp"
    ? "Could not reach the Gmail SMTP server. This host may block SMTP ports (Render's free plan does); set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN to send through the Gmail API instead."
    : "Could not reach the Gmail API. Check the server's internet connection and try again.";
  if ([421, 450, 451, 452, 454].includes(response)) return "The email server is temporarily refusing messages (rate limit). Please try again in a few minutes.";
  return "The email could not be sent. Please try again.";
};

export const verifyEmailTransport = async () => {
  try {
    await createMailer().verify();
    console.log(`Email ready (${emailProvider()})`);
    return { ok: true, provider: emailProvider() };
  } catch (error) {
    console.error(`Email verification failed (${emailProvider()}):`, error.code || "", error.responseCode || "", error.message);
    return { ok: false, provider: emailProvider(), code: error.code || null, reason: describeEmailError(error) };
  }
};

// Cached health check for the admin Payment History banner (a real SMTP login, at most once a minute).
let emailHealth = { checkedAt: 0, result: null };
export const getEmailHealth = async () => {
  if (emailHealth.result && Date.now() - emailHealth.checkedAt < 60_000) return emailHealth.result;
  let result;
  try {
    result = await Promise.race([verifyEmailTransport(), new Promise((resolve) => { setTimeout(() => resolve({ ok: false, code: "ETIMEDOUT", reason: describeEmailError({ code: "ETIMEDOUT" }) }), 20_000); })]);
  } catch (error) {
    result = { ok: false, code: null, reason: describeEmailError(error) };
  }
  emailHealth = { checkedAt: Date.now(), result };
  return result;
};
export const resetEmailHealth = () => { emailHealth = { checkedAt: 0, result: null }; };
// A real send just succeeded, so email is healthy right now (clears the admin banner immediately).
export const markEmailHealthy = () => { emailHealth = { checkedAt: Date.now(), result: { ok: true, provider: emailProvider() } }; };

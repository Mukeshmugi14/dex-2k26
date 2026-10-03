import nodemailer from "nodemailer";
import { buildPaymentConfirmationEmail, POSTER_CID, POSTER_IMAGE_PATH } from "../templates/paymentConfirmationEmail.js";
import { buildSelectionEmail } from "../templates/resultEmail.js";
import { buildRoundResultEmail } from "../templates/roundResultEmail.js";
import { buildRoundUpdateEmail } from "../templates/roundUpdateEmail.js";
import { getTeamLoginUrl, getTeamPortalPassword } from "./submissionService.js";

// Team Head Portal login details included in team emails (the email address itself comes from each team record).
const portalAccess = () => ({ loginUrl: getTeamLoginUrl(), password: getTeamPortalPassword() });

// One pooled SMTP transport for the whole process: reuses the authenticated connection instead of
// opening (and verifying) a new one for every email.
let mailer = null;
const createMailer = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    throw new Error("Email is not configured. Set EMAIL_USER and EMAIL_PASSWORD in the backend environment.");
  }
  if (!mailer) {
    console.log("EMAIL_USER exists:", true, "| EMAIL_PASSWORD exists:", true);
    mailer = nodemailer.createTransport({ service: "gmail", pool: true, maxConnections: 3, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD } });
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
    from: process.env.EMAIL_USER,
    to: recipientEmail,
    subject: "DEXATHON 2026 Registration Confirmation",
    text: `DEXATHON 2026 Registration Successful\n\nTeam Name: ${registration.teamName}\nTeam ID: ${registration.teamId}\nRegistration Number: ${registration.registrationNumber}\nAmount Paid: ₹${registration.payment.amount}\nTransaction ID: ${registration.payment.transactionId}\nPayment Status: ${registration.payment.status}\nUPI ID: ${registration.payment.upiId || "Razorpay"}\nRegistration Date: ${registration.createdAt.toLocaleDateString()}`,
  });
};

export const sendPaymentConfirmationEmail = async (registration, { submissionUrl } = {}) => {
  const mailer = createMailer();
  const recipientEmail = getRecipientEmail(registration);
  const { html, text } = buildPaymentConfirmationEmail(registration, { submissionUrl, portal: portalAccess() });
  const result = await mailer.sendMail({
    from: process.env.EMAIL_USER,
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
  const sent = await mailer.sendMail({ from: process.env.EMAIL_USER, to: recipientEmail, subject, html, text });
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
  const sent = await mailer.sendMail({ from: process.env.EMAIL_USER, to: recipientEmail, subject, html, text });
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
  const sent = await mailer.sendMail({ from: process.env.EMAIL_USER, to: recipientEmail, subject, html, text });
  const accepted = sent.accepted.map((address) => String(address).toLowerCase()).includes(recipientEmail.toLowerCase());
  if (accepted) console.log(`Round ${round} ${decision} email sent successfully`, { messageId: sent.messageId });
  else console.error("Round Result Email Error: recipient not accepted by SMTP server", { rejected: sent.rejected, response: sent.response });
  return accepted;
};

export const verifyEmailTransport = async () => {
  try {
    await createMailer().verify();
    console.log("SMTP server is ready");
  } catch (error) {
    console.error("SMTP verification failed:", error.code || "", error.responseCode || "", error.message);
  }
};

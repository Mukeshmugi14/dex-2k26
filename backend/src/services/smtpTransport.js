// Gmail SMTP client (nodemailer). The only way this backend sends email.
// Settings come only from backend environment variables (never sent to the frontend, never logged):
//   EMAIL_USER      the Gmail address that sends the emails
//   EMAIL_PASSWORD  a Gmail App Password for that account (Google Account → Security → App passwords)
import { promises as dns } from "node:dns";
import nodemailer from "nodemailer";

const SMTP_HOST = "smtp.gmail.com";

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
export const smtpUser = () => (process.env.EMAIL_USER || "").trim();
// Google shows App Passwords in groups of four ("abcd efgh ijkl mnop"); the spaces are not part of it.
const smtpPassword = () => (process.env.EMAIL_PASSWORD || "").replace(/\s+/g, "");
export const smtpConfigured = () => Boolean(smtpUser() && smtpPassword());
export const smtpSender = () => ({ email: smtpUser(), name: "DEXATHON 2026" });

const smtpError = (message, code) => Object.assign(new Error(message), { code, responseCode: null });

export const assertSmtpConfigured = () => {
  if (!smtpConfigured()) throw smtpError("Email is not configured. Set EMAIL_USER and EMAIL_PASSWORD in the backend environment.", "ESMTPCONFIG");
  if (!isEmail(smtpUser())) throw smtpError("Email is not configured. EMAIL_USER must be a Gmail address.", "ESMTPCONFIG");
};

// Gmail publishes IPv4 and IPv6 addresses; on networks with broken IPv6 routing, connections to the
// IPv6 address time out. Connect over IPv4 (re-resolved every 10 minutes), falling back to the hostname.
let ipv4 = { address: null, resolvedAt: 0 };
const smtpAddress = async () => {
  if (ipv4.address && Date.now() - ipv4.resolvedAt < 600_000) return ipv4.address;
  try {
    const [address] = await dns.resolve4(SMTP_HOST);
    ipv4 = { address: address || null, resolvedAt: Date.now() };
  } catch {
    ipv4 = { address: null, resolvedAt: Date.now() };
  }
  return ipv4.address || SMTP_HOST;
};

// One pooled transport for the whole process (recreated if the credentials or Gmail's address change).
let mailer = null;
let mailerKey = "";
const getMailer = async () => {
  assertSmtpConfigured();
  const host = await smtpAddress();
  const key = `${smtpUser()}:${smtpPassword()}:${host}`;
  if (!mailer || mailerKey !== key) {
    mailer?.close();
    mailer = nodemailer.createTransport({
      host,
      port: 465,
      secure: true,
      tls: { servername: SMTP_HOST },
      pool: true,
      maxConnections: 3,
      auth: { user: smtpUser(), pass: smtpPassword() },
      // Fail fast when the host blocks outbound SMTP instead of hanging for minutes.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    mailerKey = key;
  }
  return mailer;
};

// Logs in to Gmail SMTP without sending anything.
export const verifySmtp = async () => {
  await (await getMailer()).verify();
  return true;
};

// Connection-level failures (not login or recipient errors) are usually a brief network drop.
const CONNECTION_ERRORS = new Set(["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED", "ECONNRESET", "EDNS"]);

// Sends one email. Resolves only when Gmail accepted the recipient and returns the SMTP message ID.
export const sendWithSmtp = async ({ to, subject, html, text, attachments }) => {
  const message = {
    from: { name: smtpSender().name, address: smtpUser() },
    to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(attachments?.length ? { attachments } : {}),
  };
  let result;
  try {
    result = await (await getMailer()).sendMail(message);
  } catch (error) {
    if (!CONNECTION_ERRORS.has(error.code)) throw error;
    // One retry on a fresh connection after a short pause.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    ipv4.resolvedAt = 0;
    mailer?.close();
    mailer = null;
    result = await (await getMailer()).sendMail(message);
  }
  const accepted = (result.accepted || []).map((address) => String(address?.address || address).toLowerCase());
  if (!accepted.includes(String(to).toLowerCase())) {
    throw Object.assign(new Error(`Gmail did not accept the recipient: ${result.response || "rejected"}`), { code: "EENVELOPE", responseCode: 550 });
  }
  return { messageId: result.messageId || null, response: result.response };
};

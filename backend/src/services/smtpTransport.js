import nodemailer from "nodemailer";

const SMTP_HOST = "smtp.gmail.com";

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
export const smtpUser = () => (process.env.EMAIL_USER || process.env.email_user || "").trim();
const smtpPassword = () => (process.env.EMAIL_PASSWORD || process.env.email_password || "").replace(/\s+/g, "");
export const smtpConfigured = () => Boolean(smtpUser() && smtpPassword());
export const smtpSender = () => ({ email: smtpUser(), name: "DEXATHON 2026" });

const smtpError = (message, code) => Object.assign(new Error(message), { code, responseCode: null });

export const assertSmtpConfigured = () => {
  if (!smtpConfigured()) throw smtpError("Email is not configured. Set EMAIL_USER/email_user and EMAIL_PASSWORD/email_password.", "ESMTPCONFIG");
  if (!isEmail(smtpUser())) throw smtpError("Email is not configured. EMAIL_USER/email_user must be a valid Gmail address.", "ESMTPCONFIG");
};

let mailer = null;
let mailerKey = "";

const getMailer = () => {
  assertSmtpConfigured();
  const key = `${smtpUser()}:${smtpPassword()}`;
  if (!mailer || mailerKey !== key) {
    mailer?.close();
    mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: 465,
      secure: true,
      auth: { user: smtpUser(), pass: smtpPassword() },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    mailerKey = key;
  }
  return mailer;
};

export const verifySmtp = async () => {
  await getMailer().verify();
  return true;
};

export const CONNECTION_ERRORS = new Set(["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED", "ECONNRESET", "EDNS"]);

export const probeSmtpPorts = async () => ({
  smtp465: "open",
  smtp587: "open",
  https443: "open",
  smtpBlocked: false,
  checkedAt: new Date().toISOString(),
});

export const lastSmtpProbe = () => null;

export const sendWithSmtp = async ({ to, subject, html, text, attachments }) => {
  const message = {
    from: { name: smtpSender().name, address: smtpUser() },
    to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(attachments?.length ? { attachments } : {}),
  };
  const result = await getMailer().sendMail(message);
  const accepted = (result.accepted || []).map((addr) => String(addr?.address || addr).toLowerCase());
  if (!accepted.includes(String(to).toLowerCase())) {
    throw Object.assign(new Error(`Gmail did not accept recipient: ${result.response || "rejected"}`), { code: "EENVELOPE", responseCode: 550 });
  }
  return { messageId: result.messageId || null, response: result.response };
};

import path from "node:path";
import { fileURLToPath } from "node:url";

export const POSTER_CID = "dexathon-poster";
export const POSTER_IMAGE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/dexathon-2026-poster.jpg");

// Official DEXATHON community links shown in the payment confirmation email.
export const WHATSAPP_URL = "https://chat.whatsapp.com/B4t2PoZlgx7GFuO1E526Gr?s=cl&p=a&mlu=0";
export const INSTAGRAM_URL = "https://www.instagram.com/dexathon2k26/";

const EVENT = { date: "Wednesday, 4 November 2026", venue: "Indoor Auditorium", campus: "Sathyabama Institute of Science and Technology", duration: "24 Hours" };

export const BLACK = "#0b0b0d";
export const ORANGE = "#ff5a1f";
export const BLUE = "#1f4fe0";
export const INK = "#16171b";
export const MUTED = "#6b6f7a";
export const LINE = "#e6e7eb";
export const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
export const MONO = "Consolas, 'SFMono-Regular', Menlo, 'Courier New', monospace";

export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const formatDate = (date) => (date ? new Date(date).toLocaleString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");

const getDetails = (registration) => ({
  leaderName: registration.leader?.name?.trim() || "Team Head",
  leaderEmail: registration.leader?.email?.trim() || "",
  teamName: registration.teamName?.trim() || "",
  college: registration.college || registration.collegeName || "",
  projectTheme: registration.projectTheme || "",
  amount: Number(registration.payment?.amount ?? 0).toLocaleString("en-IN"),
  transactionId: registration.payment?.transactionId || "",
  confirmedAt: formatDate(registration.payment?.confirmedAt),
});

export const label = (text, color = MUTED) => `<div style="font-family:${FONT};font-size:10px;line-height:14px;letter-spacing:2px;font-weight:700;color:${color};text-transform:uppercase;">${text}</div>`;

// Shared by every DEXATHON email: brand footer and closing accent strip (pass an already-escaped email).
export const renderFooter = (escapedEmail) => `  <!-- Footer -->
  <tr><td class="px" bgcolor="${BLACK}" align="center" style="background:${BLACK};padding:34px 40px 30px;">
    <div style="font-family:${FONT};font-size:20px;font-weight:900;letter-spacing:6px;color:#ffffff;">DE<span style="color:${ORANGE};">X</span>ATHON 2026</div>
    <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:3px;color:#c4c6cc;padding-top:10px;">DISCOVER <span style="color:${ORANGE};">&bull;</span> EXPLORE <span style="color:${ORANGE};">&bull;</span> EXPERIMENT</div>
    <table role="presentation" width="60" cellpadding="0" cellspacing="0" border="0" style="margin:20px auto;"><tr><td height="2" bgcolor="${BLUE}" style="background:${BLUE};font-size:0;line-height:0;">&nbsp;</td></tr></table>
    <div style="font-family:${FONT};font-size:11px;letter-spacing:1px;color:#8a8d96;">Organized by</div>
    <div style="font-family:${FONT};font-size:13px;line-height:20px;color:#e6e7eb;padding-top:4px;">Department of Computer Applications &amp; Computer Science</div>
    <div style="font-family:${FONT};font-size:13px;line-height:20px;font-weight:700;color:#ffffff;">Sathyabama Institute of Science and Technology</div>
    <div style="font-family:${FONT};font-size:11px;color:#6b6f7a;padding-top:20px;">&copy; 2026 DEXATHON &middot; Sent to ${escapedEmail}</div>
  </td></tr>

  <tr><td style="font-size:0;line-height:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="30%" height="5" bgcolor="${BLUE}" style="background:${BLUE};font-size:0;line-height:0;">&nbsp;</td>
      <td width="70%" height="5" bgcolor="${ORANGE}" style="background:${ORANGE};font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>
  </td></tr>`;

// Team Head Portal "Login Credentials" card, shared by the confirmation and round-update emails.
// Pass raw (unescaped) values; this escapes them.
export const renderPortalCredentials = ({ email, password, loginUrl }, { padding = "20px 40px 0" } = {}) => {
  const e = { email: escapeHtml(email), password: escapeHtml(password), loginUrl: escapeHtml(loginUrl) };
  const field = (title, value, mono = false) => `<tr><td style="padding:0 0 12px;">
          <div style="font-family:${FONT};font-size:10px;line-height:14px;letter-spacing:2px;font-weight:700;color:#8fb4ff;text-transform:uppercase;padding-bottom:5px;">${title}</div>
          <div style="background:#ffffff;padding:11px 14px;font-family:${mono ? MONO : FONT};font-size:${mono ? "16px" : "15px"};line-height:20px;font-weight:700;letter-spacing:${mono ? "1px" : "0"};color:${INK};word-break:break-all;">${value}</div>
        </td></tr>`;
  return `<tr><td class="px" style="padding:${padding};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b1628" style="background:#0b1628;border-top:4px solid ${ORANGE};">
      <tr><td style="padding:24px 26px 26px;">
        <div style="font-family:${FONT};font-size:20px;line-height:26px;font-weight:900;letter-spacing:1px;color:#ffffff;">TEAM LOGIN PORTAL</div>
        <div style="font-family:${FONT};font-size:13px;line-height:20px;color:#b8c7dc;padding:6px 0 18px;">Use your registered Team Head email ID to access your team dashboard and round progress.</div>
        <div style="font-family:${FONT};font-size:11px;line-height:14px;letter-spacing:2px;font-weight:800;color:${ORANGE};padding-bottom:12px;">LOGIN CREDENTIALS</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${field("Team Head Email", e.email)}
          ${field("Password", e.password, true)}
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr>
          <td bgcolor="${ORANGE}" style="background:${ORANGE};"><a href="${e.loginUrl}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:13px;font-weight:800;letter-spacing:2px;color:#ffffff;text-decoration:none;">LOGIN TO TEAM PORTAL &rarr;</a></td>
        </tr></table>
        <div style="font-family:${FONT};font-size:12px;line-height:18px;color:#8fa4bd;padding-top:12px;word-break:break-all;">Login Portal: <a href="${e.loginUrl}" target="_blank" style="color:#8fb4ff;">${e.loginUrl}</a></div>
      </td></tr>
    </table>
  </td></tr>`;
};

export const portalCredentialsText = ({ email, password, loginUrl }) => `TEAM LOGIN PORTAL
Use your registered Team Head email ID to access your team dashboard.

LOGIN CREDENTIALS
Team Head Email: ${email}
Password: ${password}
Login Portal: ${loginUrl}`;

const detailCell = (title, value, extra = "") => `<td class="stack" valign="top" style="padding:16px 0 0;${extra}">${label(title)}<div style="font-family:${FONT};font-size:15px;line-height:22px;font-weight:700;color:${INK};padding-top:3px;">${value}</div></td>`;

export const buildPaymentConfirmationEmail = (registration, { portal = null } = {}) => {
  const d = getDetails(registration);
  const portalAccess = portal ? { email: d.leaderEmail, password: portal.password, loginUrl: portal.loginUrl } : null;
  const e = Object.fromEntries(Object.entries(d).map(([key, value]) => [key, escapeHtml(value)]));

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>DEXATHON 2026 — Payment Confirmed</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 22px !important; padding-right: 22px !important; }
    .stack { display: block !important; width: 100% !important; }
    .hero-title { font-size: 30px !important; line-height: 34px !important; }
    .team-name { font-size: 24px !important; line-height: 30px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#ecedf0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Payment verified — ${e.teamName} is confirmed for DEXATHON 2026, ${EVENT.date}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ecedf0" style="background:#ecedf0;">
<tr><td align="center" style="padding:28px 12px;">

<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;">

  <!-- Accent strip -->
  <tr><td style="font-size:0;line-height:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="70%" height="5" bgcolor="${ORANGE}" style="background:${ORANGE};font-size:0;line-height:0;">&nbsp;</td>
      <td width="30%" height="5" bgcolor="${BLUE}" style="background:${BLUE};font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>
  </td></tr>

  <!-- Header -->
  <tr><td class="px" bgcolor="${BLACK}" style="background:${BLACK};padding:30px 40px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle" style="font-family:${FONT};font-size:13px;letter-spacing:5px;font-weight:800;color:#ffffff;">DE<span style="color:${ORANGE};">X</span>ATHON <span style="color:${BLUE};">2026</span></td>
      <td valign="middle" align="right" style="font-family:${MONO};font-size:10px;letter-spacing:2px;color:#8a8d96;">// 24H HACKATHON</td>
    </tr></table>
    <div class="hero-title" style="font-family:${FONT};font-size:38px;line-height:42px;font-weight:900;color:#ffffff;letter-spacing:1px;padding-top:22px;">PAYMENT<br>CONFIRMED<span style="color:${ORANGE};">.</span></div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;"><tr>
      <td bgcolor="${ORANGE}" style="background:${ORANGE};padding:7px 14px;font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:2px;color:#ffffff;white-space:nowrap;">&#10003;&nbsp; VERIFIED</td>
      <td style="padding-left:14px;font-family:${FONT};font-size:12px;color:#a7aab3;">${e.confirmedAt ? `Confirmed on ${e.confirmedAt}` : "Registration payment received"}</td>
    </tr></table>
  </td></tr>

  <!-- Poster -->
  <tr><td bgcolor="${BLACK}" style="background:${BLACK};padding:0;font-size:0;line-height:0;">
    <img src="cid:${POSTER_CID}" width="600" alt="DEXATHON 2026 — 24 Hours Hackathon, Wednesday 4 November 2026, Indoor Auditorium, Sathyabama" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;">
  </td></tr>

  <!-- Welcome -->
  <tr><td class="px" style="padding:40px 40px 8px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="28" height="3" bgcolor="${ORANGE}" style="background:${ORANGE};font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding-left:10px;">${label("Registration Confirmed", ORANGE)}</td>
    </tr></table>
    <div style="font-family:${FONT};font-size:22px;line-height:30px;font-weight:800;color:${INK};padding-top:16px;">Hello ${e.leaderName},</div>
    <div style="font-family:${FONT};font-size:15px;line-height:24px;color:#3d404a;padding-top:10px;">Your registration for <strong style="color:${INK};">DEXATHON 2026</strong> has been successfully confirmed. We&rsquo;re excited to have your team join this 24-hour hackathon.</div>
  </td></tr>

  <!-- Details card -->
  <tr><td class="px" style="padding:24px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f7f9" style="background:#f6f7f9;border:1px solid ${LINE};border-left:4px solid ${ORANGE};">
      <tr><td style="padding:24px 26px 26px;">
        ${label("Team Name")}
        <div class="team-name" style="font-family:${FONT};font-size:28px;line-height:34px;font-weight:900;color:${INK};padding-top:4px;word-break:break-word;">${e.teamName}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-top:1px solid ${LINE};">
          <tr>
            ${detailCell("Team Head", `${e.leaderName}${e.leaderEmail ? `<br><span style="font-weight:400;font-size:13px;color:${MUTED};">${e.leaderEmail}</span>` : ""}`, "width:55%;padding-right:12px;")}
            ${detailCell("Registration Amount", `&#8377;${e.amount}`, "width:45%;")}
          </tr>
          <tr>${detailCell("College", e.college || "&mdash;", "")}<td class="stack" style="padding:16px 0 0;">${label("Payment Status")}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:5px;"><tr><td style="border:1px solid ${BLUE};padding:4px 10px;font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:1.5px;color:${BLUE};">&#9679; CONFIRMED</td></tr></table></td></tr>
        </table>
        ${e.projectTheme ? `<!-- Selected project theme (highlighted) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;"><tr>
          <td bgcolor="#fff3ea" style="background:#fff3ea;border:2px solid ${ORANGE};padding:14px 16px;">
            <div style="font-family:${FONT};font-size:10px;line-height:14px;letter-spacing:2px;font-weight:800;color:${ORANGE};">PROJECT THEME</div>
            <div style="font-family:${FONT};font-size:19px;line-height:25px;font-weight:900;letter-spacing:.5px;color:${INK};padding-top:4px;text-transform:uppercase;">${e.projectTheme}</div>
          </td>
        </tr></table>` : ""}
        <div style="padding-top:18px;">${label("Transaction ID")}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr>
          <td bgcolor="#ffffff" style="background:#ffffff;border:1px dashed #c9ccd3;padding:11px 14px;font-family:${MONO};font-size:15px;letter-spacing:1px;color:${INK};word-break:break-all;">${e.transactionId || "&mdash;"}</td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Verified -->
  <tr><td class="px" style="padding:20px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BLUE}" style="background:${BLUE};">
      <tr>
        <td width="62" valign="middle" align="center" style="padding:20px 0 20px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="40" height="40" align="center" valign="middle" bgcolor="${ORANGE}" style="background:${ORANGE};border-radius:20px;font-family:${FONT};font-size:20px;font-weight:900;color:#ffffff;">&#10003;</td></tr></table>
        </td>
        <td valign="middle" style="padding:20px 22px 20px 14px;">
          <div style="font-family:${FONT};font-size:14px;font-weight:900;letter-spacing:2px;color:#ffffff;">PAYMENT VERIFIED</div>
          <div style="font-family:${FONT};font-size:13px;line-height:20px;color:#dbe4ff;padding-top:4px;">Your registration payment has been successfully verified by the DEXATHON administration.</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Community: WhatsApp + Instagram -->
  <tr><td class="px" style="padding:20px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f7f9" style="background:#f6f7f9;border:1px solid ${LINE};border-top:4px solid ${ORANGE};">
      <tr><td style="padding:22px 24px 8px;">
        ${label("Follow DEXATHON 2026", ORANGE)}
        <div style="font-family:${FONT};font-size:20px;line-height:26px;font-weight:900;color:${INK};padding-top:4px;">JOIN OUR WHATSAPP COMMUNITY</div>
        <div style="font-family:${FONT};font-size:14px;line-height:22px;color:#3d404a;padding-top:6px;">Get event updates, announcements and help from the organizers. Follow us on Instagram for highlights.</div>
      </td></tr>
      <tr><td style="padding:8px 24px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td class="stack" valign="top" style="padding:8px 3px 0;width:50%;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td align="center" bgcolor="#1fa855" style="background:#1fa855;"><a href="${escapeHtml(WHATSAPP_URL)}" target="_blank" style="display:block;padding:14px 12px;font-family:${FONT};font-size:13px;font-weight:800;letter-spacing:1px;color:#ffffff;text-decoration:none;">&#128241; JOIN WHATSAPP GROUP &rarr;</a></td>
            </tr></table>
          </td>
          <td class="stack" valign="top" style="padding:8px 3px 0;width:50%;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td align="center" bgcolor="#d62976" style="background:#d62976;"><a href="${escapeHtml(INSTAGRAM_URL)}" target="_blank" style="display:block;padding:14px 12px;font-family:${FONT};font-size:13px;font-weight:800;letter-spacing:1px;color:#ffffff;text-decoration:none;">&#128248; FOLLOW US ON INSTAGRAM &rarr;</a></td>
            </tr></table>
          </td>
        </tr></table>
        <div style="font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};padding-top:12px;word-break:break-all;">WhatsApp: <a href="${escapeHtml(WHATSAPP_URL)}" target="_blank" style="color:${BLUE};">${escapeHtml(WHATSAPP_URL)}</a><br>Instagram: <a href="${escapeHtml(INSTAGRAM_URL)}" target="_blank" style="color:${BLUE};">${escapeHtml(INSTAGRAM_URL)}</a></div>
      </td></tr>
    </table>
  </td></tr>

  <!-- Event info -->
  <tr><td class="px" style="padding:20px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BLACK}" style="background:${BLACK};">
      <tr><td style="padding:24px 26px 6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-family:${FONT};font-size:13px;font-weight:900;letter-spacing:4px;color:#ffffff;">EVENT DETAILS</td>
          <td align="right" style="font-family:${MONO};font-size:10px;letter-spacing:2px;color:${ORANGE};">[ 01 ]</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:0 26px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:14px 0;border-bottom:1px solid #26272d;">${label("Date", ORANGE)}<div style="font-family:${FONT};font-size:16px;line-height:22px;font-weight:700;color:#ffffff;padding-top:3px;">${EVENT.date}</div></td></tr>
          <tr><td style="padding:14px 0;border-bottom:1px solid #26272d;">${label("Venue", ORANGE)}<div style="font-family:${FONT};font-size:16px;line-height:22px;font-weight:700;color:#ffffff;padding-top:3px;">${EVENT.venue},</div><div style="font-family:${FONT};font-size:13px;line-height:20px;color:#a7aab3;">${EVENT.campus}</div></td></tr>
          <tr><td style="padding:14px 0 0;">${label("Duration", ORANGE)}<div style="font-family:${FONT};font-size:16px;line-height:22px;font-weight:700;color:#ffffff;padding-top:3px;">${EVENT.duration.toUpperCase()} <span style="font-weight:400;color:#a7aab3;font-size:13px;">&nbsp;non-stop build</span></div></td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  ${portalAccess ? `<!-- Team Head Portal credentials -->\n${renderPortalCredentials(portalAccess)}` : ""}
  <!-- Important -->
  <tr><td class="px" style="padding:20px 40px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px dashed ${ORANGE};">
      <tr>
        <td width="44" valign="top" align="center" style="padding:18px 0 18px 16px;font-family:${FONT};font-size:18px;font-weight:900;color:${ORANGE};">!</td>
        <td style="padding:18px 20px 18px 8px;font-family:${FONT};font-size:14px;line-height:22px;color:#3d404a;"><strong style="color:${INK};">Keep this email for your records.</strong><br>Please carry your registration details during the event.</td>
      </tr>
    </table>
  </td></tr>

${renderFooter(e.leaderEmail)}

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `DEXATHON 2026 — PAYMENT CONFIRMED ✓

Hello ${d.leaderName},

Your registration for DEXATHON 2026 has been successfully confirmed.
We're excited to have your team join this 24-hour hackathon.

REGISTRATION DETAILS
Team Name: ${d.teamName}
Team Head: ${d.leaderName}
College: ${d.college}${d.projectTheme ? `\n\nPROJECT THEME: ${d.projectTheme.toUpperCase()}\n` : ""}
Registration Amount: ₹${d.amount}
Transaction ID: ${d.transactionId}
Payment Status: CONFIRMED${d.confirmedAt ? `\nConfirmed On: ${d.confirmedAt}` : ""}

✓ PAYMENT VERIFIED
Your registration payment has been successfully verified by the DEXATHON administration.

FOLLOW DEXATHON 2026
Join our WhatsApp Community: ${WHATSAPP_URL}
Follow us on Instagram: ${INSTAGRAM_URL}

EVENT DETAILS
Date: ${EVENT.date}
Venue: ${EVENT.venue}, ${EVENT.campus}
Duration: ${EVENT.duration}
${portalAccess ? `\n${portalCredentialsText(portalAccess)}\n` : ""}
Keep this email for your records.
Please carry your registration details during the event.

DEXATHON 2026
Discover • Explore • Experiment
Organized by Department of Computer Applications & Computer Science
Sathyabama Institute of Science and Technology
© 2026 DEXATHON`;

  return { html, text };
};

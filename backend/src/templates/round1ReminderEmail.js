import { BLACK, BLUE, escapeHtml, FONT, INK, label, LINE, MUTED, ORANGE, portalCredentialsText, renderFooter, renderPortalCredentials } from "./paymentConfirmationEmail.js";

const formatDeadline = (date) => `${new Date(date).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST`;
const formatDate = (date) => (date ? new Date(date).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");

// Round 1 deadline reminder. Teams that haven't submitted get the steps to submit; teams that have submitted get a
// confirmation that the PDF was received and can still be replaced until the deadline.
export const buildRound1ReminderEmail = (registration, deadline, portal) => {
  const submitted = Boolean(registration.pdfSubmission?.fileId);
  const d = {
    teamName: registration.teamName?.trim() || "",
    leaderName: registration.leader?.name?.trim() || "Team Head",
    leaderEmail: registration.leader?.email?.trim() || "",
    deadline: formatDeadline(deadline),
    fileName: registration.pdfSubmission?.fileName || "",
    submittedAt: formatDate(registration.pdfSubmission?.submittedAt),
  };
  const e = Object.fromEntries(Object.entries(d).map(([key, value]) => [key, escapeHtml(value)]));
  const p = (html, extra = "") => `<div style="font-family:${FONT};font-size:15px;line-height:24px;color:#3d404a;${extra}">${html}</div>`;
  const step = (n, html) => `<tr><td valign="top" width="34" style="padding:0 0 12px;"><div style="width:24px;height:24px;line-height:24px;text-align:center;background:${ORANGE};color:#ffffff;font-family:${FONT};font-size:12px;font-weight:800;">${n}</div></td>
      <td valign="top" style="padding:2px 0 12px;font-family:${FONT};font-size:14px;line-height:21px;color:${INK};">${html}</td></tr>`;

  const body = submitted
    ? `${p(`Hi ${e.leaderName},`)}
    ${p(`We have received your team's <strong>Round 1 PDF</strong>. Thank you!`, "padding-top:12px;")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;border:1px solid ${LINE};"><tr><td style="padding:14px 18px;">
      ${label("Submitted file")}<div style="font-family:${FONT};font-size:15px;font-weight:700;color:${INK};padding-top:3px;word-break:break-all;">${e.fileName}</div>
      <div style="font-family:${FONT};font-size:12px;color:${MUTED};padding-top:2px;">Received ${e.submittedAt}</div>
    </td></tr></table>
    ${p(`You can still <strong>view, replace or delete</strong> it in the Team Head Portal until <strong style="color:${ORANGE};">${e.deadline}</strong>. After that, submissions are locked.`, "padding-top:16px;")}
    ${p(`Round 1 results will be announced on <strong>Sunday, 25 October 2026, 7:00 PM</strong>.`, "padding-top:12px;")}`
    : `${p(`Hi ${e.leaderName},`)}
    ${p(`This is a reminder that <strong>Round 1 PPT submission closes on <span style="color:${ORANGE};">${e.deadline}</span></strong>. Our records show your team <strong>has not submitted</strong> its Round 1 PDF yet.`, "padding-top:12px;")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
      ${step(1, "Log in to the <strong>Team Head Portal</strong> with the details below and download the official Round 1 PPT template.")}
      ${step(2, "Prepare your presentation and <strong>save it as a PDF</strong>. Maximum 15 MB. PPT, PPTX and other formats are not accepted.")}
      ${step(3, "Upload the PDF in the portal under <strong>Round 1 PDF Submission</strong> before the deadline.")}
    </table>
    ${p(`Submission closes automatically at the deadline and <strong>late submissions cannot be accepted</strong>, so please don't wait until the last minute.`, "padding-top:6px;")}`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>DEXATHON 2026 — Round 1 Deadline Reminder</title>
<style>@media only screen and (max-width: 620px){.container{width:100%!important}.px{padding-left:22px!important;padding-right:22px!important}}</style></head>
<body style="margin:0;padding:0;background:#ecedf0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ecedf0" style="background:#ecedf0;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;">
  <tr><td style="font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="70%" height="5" bgcolor="${ORANGE}" style="background:${ORANGE};font-size:0;line-height:0;">&nbsp;</td>
    <td width="30%" height="5" bgcolor="${BLUE}" style="background:${BLUE};font-size:0;line-height:0;">&nbsp;</td>
  </tr></table></td></tr>
  <tr><td class="px" bgcolor="${BLACK}" style="background:${BLACK};padding:30px 40px 28px;">
    <div style="font-family:${FONT};font-size:13px;letter-spacing:5px;font-weight:800;color:#ffffff;">DE<span style="color:${ORANGE};">X</span>ATHON <span style="color:${BLUE};">2026</span></div>
    <div style="font-family:${FONT};font-size:30px;line-height:36px;font-weight:900;color:#ffffff;padding-top:18px;">${submitted ? "ROUND 1 PDF RECEIVED" : "ROUND 1 DEADLINE REMINDER"}</div>
    <div style="font-family:${FONT};font-size:13px;letter-spacing:1px;color:#c4c6cc;padding-top:8px;">PPT submission closes ${e.deadline}</div>
  </td></tr>
  <tr><td class="px" style="padding:30px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f7f9" style="background:#f6f7f9;border:1px solid ${LINE};border-left:4px solid ${submitted ? BLUE : ORANGE};">
      <tr><td style="padding:16px 22px;">${label("Team Name")}<div style="font-family:${FONT};font-size:17px;font-weight:800;color:${INK};padding:3px 0 10px;">${e.teamName}</div>
        ${label("Round 1 Status")}<div style="font-family:${FONT};font-size:15px;font-weight:800;color:${submitted ? "#1a8f55" : ORANGE};padding-top:3px;">${submitted ? "PDF SUBMITTED" : "NOT SUBMITTED YET"}</div></td></tr>
    </table>
  </td></tr>
  <tr><td class="px" style="padding:24px 40px 0;">
    ${body}
  </td></tr>
${renderPortalCredentials(portal)}
  <tr><td class="px" style="padding:22px 40px 36px;">
    <div style="font-family:${FONT};font-size:14px;line-height:22px;color:${INK};">All the best,<br><strong>DEXATHON 2026 Team</strong></div>
  </td></tr>
${renderFooter(e.leaderEmail)}
</table>
</td></tr></table>
</body></html>`;

  const text = submitted
    ? `DEXATHON 2026\n\nROUND 1 PDF RECEIVED\n\nTeam Name: ${d.teamName}\nRound 1 Status: PDF SUBMITTED\n\nHi ${d.leaderName},\n\nWe have received your team's Round 1 PDF (${d.fileName}, received ${d.submittedAt}). Thank you!\n\nYou can still view, replace or delete it in the Team Head Portal until ${d.deadline}. After that, submissions are locked.\n\nRound 1 results will be announced on Sunday, 25 October 2026, 7:00 PM.\n\n${portalCredentialsText(portal)}\n\nAll the best,\nDEXATHON 2026 Team`
    : `DEXATHON 2026\n\nROUND 1 DEADLINE REMINDER\n\nTeam Name: ${d.teamName}\nRound 1 Status: NOT SUBMITTED YET\n\nHi ${d.leaderName},\n\nThis is a reminder that Round 1 PPT submission closes on ${d.deadline}. Our records show your team has not submitted its Round 1 PDF yet.\n\n1. Log in to the Team Head Portal with the details below and download the official Round 1 PPT template.\n2. Prepare your presentation and save it as a PDF. Maximum 15 MB. PPT, PPTX and other formats are not accepted.\n3. Upload the PDF in the portal under Round 1 PDF Submission before the deadline.\n\nSubmission closes automatically at the deadline and late submissions cannot be accepted, so please don't wait until the last minute.\n\n${portalCredentialsText(portal)}\n\nAll the best,\nDEXATHON 2026 Team`;

  const subject = submitted
    ? "DEXATHON 2026 — Round 1 PDF received (edits allowed until 23 Oct, 11 PM)"
    : "Reminder: DEXATHON 2026 Round 1 PPT submission closes 23 Oct, 11 PM";
  return { subject, html, text };
};

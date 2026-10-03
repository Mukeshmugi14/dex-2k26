import { ROUND_INFO, ROUND_KEYS, STATUS_LABELS } from "../services/roundService.js";
import { BLACK, BLUE, escapeHtml, FONT, INK, label, LINE, MUTED, ORANGE, portalCredentialsText, renderFooter, renderPortalCredentials } from "./paymentConfirmationEmail.js";

const STATUS_COLORS = { COMPLETED: "#1a8f55", SELECTED: ORANGE, LIVE: BLUE, NOT_SELECTED: "#c0392b", PENDING: "#b7791f", UPCOMING: MUTED };

// Round update email. A NOT_SELECTED team receives the short "not selected" version instead of the progress list.
export const buildRoundUpdateEmail = (registration, rounds, portal) => {
  const notSelected = ROUND_KEYS.some((key) => rounds[key] === "NOT_SELECTED");
  const d = { teamName: registration.teamName?.trim() || "", leaderName: registration.leader?.name?.trim() || "Team Head", leaderEmail: registration.leader?.email?.trim() || "" };
  const e = Object.fromEntries(Object.entries(d).map(([key, value]) => [key, escapeHtml(value)]));
  const visibleRounds = notSelected ? ROUND_KEYS.slice(0, ROUND_KEYS.findIndex((key) => rounds[key] === "NOT_SELECTED") + 1) : ROUND_KEYS;
  const portalAccess = { email: d.leaderEmail, password: portal.password, loginUrl: portal.loginUrl };
  const statusLine = (key) => `ROUND ${ROUND_INFO[key].number} — ${STATUS_LABELS[rounds[key]].toUpperCase()}`;

  const roundRows = visibleRounds.map((key) => `<tr><td style="padding:11px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;font-weight:700;color:${INK};">ROUND ${ROUND_INFO[key].number}<div style="font-weight:400;font-size:12px;color:${MUTED};padding-top:2px;">${ROUND_INFO[key].title}</div></td>
    <td align="right" style="padding:11px 0;border-bottom:1px solid ${LINE};"><span style="display:inline-block;padding:5px 10px;font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:1.5px;color:#ffffff;background:${STATUS_COLORS[rounds[key]]};white-space:nowrap;">${STATUS_LABELS[rounds[key]].toUpperCase()}</span></td></tr>`).join("");

  const body = notSelected
    ? `<div style="font-family:${FONT};font-size:15px;line-height:24px;color:#3d404a;">Thank you for participating in DEXATHON 2026.<br><br>After evaluation, your team has not been selected for the next round.<br><br>Thank you for your participation and effort.</div>`
    : `<div style="font-family:${FONT};font-size:15px;line-height:24px;color:#3d404a;">Your current DEXATHON round status:</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-top:1px solid ${LINE};">${roundRows}</table>
    <div style="font-family:${FONT};font-size:14px;line-height:22px;color:${MUTED};padding-top:18px;">Please login to the Team Head Portal to view the latest details.</div>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>DEXATHON 2026 — Round Update</title>
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
    <div style="font-family:${FONT};font-size:30px;line-height:36px;font-weight:900;color:#ffffff;padding-top:18px;">ROUND UPDATE</div>
  </td></tr>
  <tr><td class="px" style="padding:30px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f7f9" style="background:#f6f7f9;border:1px solid ${LINE};border-left:4px solid ${notSelected ? BLUE : ORANGE};">
      <tr><td style="padding:16px 22px;">${label("Team Name")}<div style="font-family:${FONT};font-size:17px;font-weight:800;color:${INK};padding:3px 0 10px;">${e.teamName}</div>
        ${notSelected ? "" : `${label("Team Head")}<div style="font-family:${FONT};font-size:15px;font-weight:700;color:${INK};padding-top:3px;">${e.leaderName}</div>`}</td></tr>
    </table>
  </td></tr>
  <tr><td class="px" style="padding:24px 40px 0;">
    ${body}
  </td></tr>
${notSelected ? "" : renderPortalCredentials(portalAccess)}
  <tr><td class="px" style="padding:22px 40px 36px;">
    <div style="font-family:${FONT};font-size:14px;line-height:22px;color:${INK};"><strong>DEXATHON 2026 Team</strong></div>
  </td></tr>
${renderFooter(e.leaderEmail)}
</table>
</td></tr></table>
</body></html>`;

  const text = notSelected
    ? `DEXATHON 2026\n\nROUND UPDATE\n\nTeam Name:\n${d.teamName}\n\nThank you for participating in DEXATHON 2026.\n\nAfter evaluation, your team has not been selected for the next round.\n\nThank you for your participation and effort.\n\nDEXATHON 2026 Team`
    : `DEXATHON 2026\n\nROUND UPDATE\n\nTeam Name:\n${d.teamName}\n\nTeam Head:\n${d.leaderName}\n\nYour current DEXATHON round status:\n\n${visibleRounds.map(statusLine).join("\n")}\n\nPlease login to the Team Head Portal to view the latest details.\n\n${portalCredentialsText(portalAccess)}\n\nDEXATHON 2026 Team`;

  return { subject: "DEXATHON 2026 — Round Update", html, text };
};

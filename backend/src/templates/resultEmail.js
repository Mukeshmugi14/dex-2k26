import { BLACK, BLUE, escapeHtml, FONT, INK, label, LINE, MUTED, ORANGE, renderFooter } from "./paymentConfirmationEmail.js";

const formatScore = (value) => (Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "—");

// Second Round Selection email — sent only to teams the admin marks as "Selected".
export const buildSelectionEmail = (registration) => {
  const d = {
    leaderName: registration.leader?.name?.trim() || "Team Head",
    leaderEmail: registration.leader?.email?.trim() || "",
    teamName: registration.teamName?.trim() || "",
    college: registration.college || registration.collegeName || "",
    totalScore: formatScore(registration.evaluation?.totalScore),
  };
  const e = Object.fromEntries(Object.entries(d).map(([key, value]) => [key, escapeHtml(value)]));
  const row = (title, value) => `<tr><td style="padding:12px 0;border-bottom:1px solid ${LINE};">${label(title)}<div style="font-family:${FONT};font-size:15px;line-height:22px;font-weight:700;color:${INK};padding-top:3px;">${value}</div></td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>DEXATHON 2026 — Second Round Selection</title>
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
    <div style="font-family:${FONT};font-size:30px;line-height:36px;font-weight:900;color:#ffffff;padding-top:18px;">SECOND ROUND SELECTION</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>
      <td bgcolor="${ORANGE}" style="background:${ORANGE};padding:7px 14px;font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:2px;color:#ffffff;white-space:nowrap;">&#10003;&nbsp; SELECTED</td>
    </tr></table>
  </td></tr>
  <tr><td class="px" style="padding:36px 40px 8px;">
    <div style="font-family:${FONT};font-size:24px;line-height:30px;font-weight:900;color:${INK};">Congratulations!</div>
    <div style="font-family:${FONT};font-size:15px;line-height:24px;color:#3d404a;padding-top:10px;">Your team has been selected for the <strong style="color:${INK};">Second Round of DEXATHON 2026</strong>.</div>
  </td></tr>
  <tr><td class="px" style="padding:22px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f7f9" style="background:#f6f7f9;border:1px solid ${LINE};border-left:4px solid ${ORANGE};">
      <tr><td style="padding:8px 26px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${row("Team Name", e.teamName)}
        ${row("Team Head", e.leaderName)}
        ${row("College", e.college || "&mdash;")}
        <tr><td style="padding:12px 0 0;">${label("Evaluation Score")}<div style="font-family:${FONT};font-size:28px;line-height:34px;font-weight:900;color:${ORANGE};padding-top:3px;">${e.totalScore}</div></td></tr>
      </table></td></tr>
    </table>
  </td></tr>
  <tr><td class="px" style="padding:22px 40px 40px;">
    <div style="font-family:${FONT};font-size:15px;line-height:24px;font-weight:700;color:${INK};">You have successfully qualified for the Second Round.</div>
    <div style="font-family:${FONT};font-size:14px;line-height:22px;color:${MUTED};padding-top:6px;">Further instructions will be shared by the DEXATHON 2026 team.</div>
    <div style="font-family:${FONT};font-size:14px;line-height:22px;color:${INK};padding-top:16px;">Thank you,<br><strong>DEXATHON 2026 Team</strong></div>
  </td></tr>
${renderFooter(e.leaderEmail)}
</table>
</td></tr></table>
</body></html>`;

  const text = `DEXATHON 2026

SECOND ROUND SELECTION

Congratulations!

Your team has been selected for the Second Round of DEXATHON 2026.

Team Name:
${d.teamName}

Team Head:
${d.leaderName}

College:
${d.college}

Evaluation Score:
${d.totalScore}

You have successfully qualified for the Second Round.

Further instructions will be shared by the DEXATHON 2026 team.

Thank you,
DEXATHON 2026 Team`;

  return { subject: "DEXATHON 2026 — Second Round Selection 🎉", html, text };
};

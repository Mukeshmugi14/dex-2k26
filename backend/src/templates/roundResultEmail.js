import { BLACK, BLUE, escapeHtml, FONT, INK, label, LINE, MUTED, ORANGE, portalCredentialsText, renderFooter, renderPortalCredentials } from "./paymentConfirmationEmail.js";

// Round-specific wording. The last round (FINAL_ROUND_NUMBER, default 3) is the final round and has no "next round".
export const FINAL_ROUND = Number(process.env.FINAL_ROUND_NUMBER) || 3;

export const roundResultWording = (round, decision) => {
  const isFinal = round >= FINAL_ROUND;
  const heading = isFinal ? "FINAL ROUND RESULT" : `ROUND ${round} RESULT`;
  if (decision === "SELECTED") {
    return {
      heading,
      subject: `DEXATHON 2026 — ${isFinal ? "Final Round" : `Round ${round}`} Result: Selected 🎉`,
      lead: "Congratulations!",
      message: isFinal
        ? "Your team has been selected in the Final Round of DEXATHON 2026."
        : `Your team has been selected for the next round of DEXATHON 2026 — Round ${round + 1}.`,
      resultLabel: "✓ SELECTED",
      closing: "Please login to the Team Head Portal to view your latest round status.",
    };
  }
  return {
    heading,
    subject: `DEXATHON 2026 — ${isFinal ? "Final Round" : `Round ${round}`} Result`,
    lead: "Thank you for participating in DEXATHON 2026.",
    message: isFinal
      ? "After evaluation, your team has not been selected in the Final Round."
      : "After evaluation, your team has not been selected for the next round.",
    resultLabel: "✕ NOT SELECTED",
    closing: "Thank you for your participation.",
  };
};

export const buildRoundResultEmail = (registration, round, decision, portal) => {
  const w = roundResultWording(round, decision);
  const selected = decision === "SELECTED";
  const d = {
    teamName: registration.teamName?.trim() || "",
    leaderName: registration.leader?.name?.trim() || "Team Head",
    leaderEmail: registration.leader?.email?.trim() || "",
    college: registration.college || registration.collegeName || "",
  };
  const e = Object.fromEntries(Object.entries(d).map(([key, value]) => [key, escapeHtml(value)]));
  const accent = selected ? ORANGE : BLUE;
  const row = (title, value) => `<tr><td style="padding:11px 0;border-bottom:1px solid ${LINE};">${label(title)}<div style="font-family:${FONT};font-size:15px;line-height:22px;font-weight:700;color:${INK};padding-top:3px;">${value}</div></td></tr>`;
  const portalAccess = { email: d.leaderEmail, password: portal.password, loginUrl: portal.loginUrl };

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>DEXATHON 2026 — ${w.heading}</title>
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
    <div style="font-family:${FONT};font-size:30px;line-height:36px;font-weight:900;color:#ffffff;padding-top:18px;">${w.heading}</div>
  </td></tr>
  <tr><td class="px" style="padding:32px 40px 0;">
    <div style="font-family:${FONT};font-size:${selected ? "24px" : "17px"};line-height:30px;font-weight:${selected ? 900 : 700};color:${INK};">${w.lead}</div>
    <div style="font-family:${FONT};font-size:15px;line-height:24px;color:#3d404a;padding-top:8px;">${w.message}</div>
  </td></tr>
  <tr><td class="px" style="padding:22px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f7f9" style="background:#f6f7f9;border:1px solid ${LINE};border-left:4px solid ${accent};">
      <tr><td style="padding:6px 24px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${row("Team Name", e.teamName)}
        ${selected ? row("Team Head", e.leaderName) + row("College", e.college || "&mdash;") : ""}
        <tr><td style="padding:12px 0 0;">${label("Result")}<div style="font-family:${FONT};font-size:22px;line-height:28px;font-weight:900;color:${selected ? ORANGE : "#c0392b"};padding-top:3px;">${w.resultLabel}</div></td></tr>
      </table></td></tr>
    </table>
  </td></tr>
  <tr><td class="px" style="padding:18px 40px 0;"><div style="font-family:${FONT};font-size:14px;line-height:22px;color:${MUTED};">${w.closing}</div></td></tr>
${selected ? renderPortalCredentials(portalAccess) : ""}
  <tr><td class="px" style="padding:22px 40px 36px;"><div style="font-family:${FONT};font-size:14px;line-height:22px;color:${INK};"><strong>DEXATHON 2026 Team</strong></div></td></tr>
${renderFooter(e.leaderEmail)}
</table>
</td></tr></table>
</body></html>`;

  const text = [
    "DEXATHON 2026", "", w.heading, "",
    w.lead, "", w.message, "",
    "Team Name:", d.teamName, "",
    ...(selected ? ["Team Head:", d.leaderName, "", "College:", d.college, ""] : []),
    "Result:", w.resultLabel, "",
    w.closing, "",
    ...(selected ? [portalCredentialsText(portalAccess), ""] : []),
    "DEXATHON 2026 Team",
  ].join("\n");

  return { subject: w.subject, html, text };
};

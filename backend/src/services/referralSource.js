// "From where did you know about this event?" — free-text answers grouped into channels for analytics.
// The original answer is always kept; the category is only for counting.
const CHANNELS = [
  ["Instagram", /insta|\big\b|reel/],
  ["WhatsApp", /whats ?app|\bwa\b|whatsapp group/],
  ["LinkedIn", /linked ?in/],
  ["Unstop / event sites", /unstop|devfolio|devpost|hack2skill|knowafest|eventbrite|allevents|website|google/],
  ["Faculty / college", /faculty|mentor|professor|\bprof\b|\bsir\b|\bmam\b|madam|\bhod\b|teacher|staff|college|department|dept|circular|notice|poster|club|placement|coordinator|senior/],
  ["Friends", /friend|frnd|classmate|team ?mate|word of mouth|mouth|peer|brother|sister|cousin|relative/],
  ["Email", /e-?mail|mail\b/],
  ["YouTube", /youtube|yt\b/],
  ["Telegram", /telegram/],
];

export const referralCategory = (answer) => {
  const s = String(answer ?? "").trim().toLowerCase();
  if (!s) return "Not answered";
  return CHANNELS.find(([, re]) => re.test(s))?.[0] || "Other";
};

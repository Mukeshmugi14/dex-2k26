import axios from "axios";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, Megaphone, RefreshCw, ShieldCheck, Shuffle, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminDashboard.css";
import "./AdminAnalytics.css";
import { API_URL } from "../config/api";
import { clearAdminSession, getAdminToken } from "../config/adminSession";
import useAutoRefresh from "../config/useAutoRefresh";
import AdminNav from "../components/AdminNav";

const fmtDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtTime = (value) => (value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "Never");
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

// Status meaning is carried by the icon + label; the colour only reinforces it.
const STATUS = {
  Sent: { tone: "good", Icon: CheckCircle2 },
  Sending: { tone: "warning", Icon: Clock3 },
  "Not Sent": { tone: "neutral", Icon: Clock3 },
  Failed: { tone: "critical", Icon: XCircle },
};

// One tooltip shared by every chart; follows the pointer, stays inside the window.
function useTooltip() {
  const [tip, setTip] = useState(null);
  const show = (event, lines) => setTip({ x: event.clientX, y: event.clientY, lines });
  const hide = () => setTip(null);
  const node = tip ? <div className="viz-tooltip" role="status" style={{ left: Math.min(tip.x + 14, window.innerWidth - 230), top: tip.y + 14 }}>
    {tip.lines.map((line, i) => <div key={i} className={i ? "" : "viz-tooltip-title"}>{line}</div>)}
  </div> : null;
  return { show, hide, node };
}

function ChartCard({ title, subtitle, table, children, wide }) {
  const [asTable, setAsTable] = useState(false);
  return <section className={`viz-card ${wide ? "is-wide" : ""}`}>
    <header className="viz-card-head">
      <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
      {table ? <button type="button" className="viz-toggle" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>{asTable ? "Show chart" : "Show table"}</button> : null}
    </header>
    {asTable && table ? <table className="viz-table"><thead><tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table> : children}
  </section>;
}

// Horizontal bars, one series: label | bar | value. The value is always printed, so colour never carries the number.
function BarList({ items, total, tip, unit = "teams", showPercent = true }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return <ul className="viz-bars">
    {items.map((item) => <li key={item.label} className={item.other ? "is-other" : ""}
      onMouseMove={(e) => tip.show(e, [item.label, `${item.count} ${unit}${total ? ` · ${pct(item.count, total)}% of all teams` : ""}`])} onMouseLeave={tip.hide}>
      <span className="viz-bar-label" title={item.label}>{item.label}</span>
      <span className="viz-bar-track"><i style={{ width: `${(item.count / max) * 100}%` }} /></span>
      <b className="viz-bar-value">{item.count}{showPercent && total ? <small> {pct(item.count, total)}%</small> : null}</b>
    </li>)}
  </ul>;
}

function StatusRows({ items, total, tip }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return <ul className="viz-bars viz-status">
    {items.map((item) => {
      const { tone, Icon } = STATUS[item.label] || { tone: "neutral", Icon: Clock3 };
      return <li key={item.label} className={`tone-${tone}`} onMouseMove={(e) => tip.show(e, [item.label, `${item.count} teams · ${pct(item.count, total)}%`])} onMouseLeave={tip.hide}>
        <span className="viz-bar-label"><Icon size={14} aria-hidden="true" /> {item.label}</span>
        <span className="viz-bar-track"><i style={{ width: `${(item.count / max) * 100}%` }} /></span>
        <b className="viz-bar-value">{item.count}<small> {pct(item.count, total)}%</small></b>
      </li>;
    })}
  </ul>;
}

// Registrations per day: columns on one axis, with a hover crosshair showing the day, count and running total.
function DailyColumns({ data, tip }) {
  const W = 720, H = 220, pad = { t: 14, r: 8, b: 30, l: 30 };
  const max = Math.max(1, ...data.map((d) => d.count));
  const step = Math.max(1, Math.ceil(max / 4));
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const top = ticks.at(-1) < max ? ticks.at(-1) + step : ticks.at(-1);
  if (top > ticks.at(-1)) ticks.push(top);
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(6, Math.min(36, slot - 6));
  const y = (v) => pad.t + innerH - (v / top) * innerH;
  const [hover, setHover] = useState(null);
  const labelEvery = Math.ceil(data.length / 10);
  return <svg className="viz-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Teams registered per day" onMouseLeave={() => { setHover(null); tip.hide(); }}>
    {ticks.map((t) => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t ? "viz-gridline" : "viz-axis"} /><text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="viz-tick">{t}</text></g>)}
    {data.map((d, i) => {
      const cx = pad.l + slot * i + slot / 2, h = y(0) - y(d.count);
      return <g key={d.label}>
        {hover === i ? <rect x={pad.l + slot * i} y={pad.t} width={slot} height={innerH} className="viz-hover-band" /> : null}
        {d.count ? <path className="viz-col" d={`M${cx - barW / 2},${y(0)} V${y(d.count) + Math.min(4, h)} q0,-4 4,-4 H${cx + barW / 2 - 4} q4,0 4,4 V${y(0)} Z`} /> : null}
        {d.count && (hover === i || data.length <= 14) ? <text x={cx} y={y(d.count) - 5} textAnchor="middle" className="viz-col-value">{d.count}</text> : null}
        {i % labelEvery === 0 ? <text x={cx} y={H - 10} textAnchor="middle" className="viz-tick">{fmtDay(d.label)}</text> : null}
        <rect x={pad.l + slot * i} y={pad.t} width={slot} height={innerH} fill="transparent"
          onMouseMove={(e) => { setHover(i); tip.show(e, [fmtDay(d.label), `${d.count} team${d.count === 1 ? "" : "s"} registered`, `${d.total} in total by this day`]); }} />
      </g>;
    })}
  </svg>;
}

function SizeColumns({ data, tip }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return <div className="viz-sizes" role="img" aria-label="Teams by number of people">
    {data.map((d) => <div key={d.label} className="viz-size" onMouseMove={(e) => tip.show(e, [`${d.label} ${d.label === 1 ? "person" : "people"}`, `${d.count} team${d.count === 1 ? "" : "s"}`])} onMouseLeave={tip.hide}>
      <b>{d.count}</b>
      <span className="viz-size-track"><i style={{ height: `${(d.count / max) * 100}%` }} /></span>
      <small>{d.label}</small>
    </div>)}
  </div>;
}

// Simple columns (hour of day): the count is printed above each column; tooltip gives the full label.
function Columns({ data, tip, labelOf, tipOf, ariaLabel }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return <div className="viz-sizes viz-hours" role="img" aria-label={ariaLabel}>
    {data.map((d) => <div key={d.label} className="viz-size" onMouseMove={(e) => tip.show(e, tipOf(d))} onMouseLeave={tip.hide}>
      <b>{d.count || ""}</b>
      <span className="viz-size-track"><i style={{ height: `${(d.count / max) * 100}%` }} /></span>
      <small>{labelOf(d)}</small>
    </div>)}
  </div>;
}
const hourLabel = (h) => `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`;
const clock = (h) => `${((h % 24) + 11) % 12 + 1}:00 ${h % 24 < 12 ? "AM" : "PM"}`;
const hourRange = (h) => `${clock(h)} – ${clock(h + 1)}`;

// Cross-college teams: each team with its colleges and how many people come from each.
function CrossCollegeList({ data }) {
  if (!data.teams.length) return <p className="viz-empty">No cross-college teams yet.</p>;
  return <>
    <ul className="viz-groups viz-cross">{data.teams.map((team) => <li key={team.teamId}>
      <b>{team.teamId} · {team.teamName}</b> <small>{team.people} people · {team.colleges.length} colleges</small>
      <span>{team.colleges.map((c) => <em key={c.name} className={c.needsReview ? "needs-review" : ""}>{c.name.replace(/^Needs review: /, "")} <strong>×{c.people}</strong>{c.needsReview ? " (needs review)" : ""}</em>)}</span>
    </li>)}</ul>
    {data.pairs.length ? <p className="viz-note">Colleges that team up: {data.pairs.map((p) => `${p.label} (${p.count})`).join(" · ")}</p> : null}
  </>;
}

// Theme × college table: each cell's shade (one blue, light → dark) follows its count, and the number is always printed.
function ThemeByCollege({ data }) {
  const max = Math.max(1, ...data.rows.flatMap((r) => r.counts));
  return <div className="viz-table-scroll"><table className="viz-table viz-matrix">
    <thead><tr><th>College</th>{data.themes.map((theme) => <th key={theme} title={theme}>{theme}</th>)}</tr></thead>
    <tbody>{data.rows.map((row) => <tr key={row.college}><td>{row.college}</td>{row.counts.map((n, i) => <td key={data.themes[i]} className="viz-cell" style={{ "--a": n ? 0.15 + (n / max) * 0.7 : 0 }} title={`${row.college} · ${data.themes[i]}: ${n} team${n === 1 ? "" : "s"}`}>{n || "·"}</td>)}</tr>)}</tbody>
  </table></div>;
}

function CollegeGroups({ groups }) {
  if (!groups.length) return <p className="viz-empty">Every college is written one way so far.</p>;
  return <ul className="viz-groups">{groups.map((g) => <li key={g.name}>
    <b>{g.name}</b> <small>{g.spellings.length} spellings</small>
    <span>{g.spellings.join(" · ")}</span>
  </li>)}</ul>;
}

function HealthList({ items }) {
  const [open, setOpen] = useState(null);
  if (!items.length) return <p className="viz-empty"><CheckCircle2 size={16} /> No data problems found.</p>;
  return <ul className="viz-health">
    {items.map((item) => <li key={item.key}>
      <button type="button" onClick={() => setOpen(open === item.key ? null : item.key)} aria-expanded={open === item.key}>
        <AlertTriangle size={15} aria-hidden="true" /><span><b>{item.title}</b><small>{item.detail}</small></span><em>{item.count}</em><ChevronDown size={15} className={open === item.key ? "is-open" : ""} aria-hidden="true" />
      </button>
      {open === item.key ? <ol>{item.teams.map((t) => <li key={t.teamId + t.email}><b>{t.teamId}</b> {t.teamName} <span>{t.email}</span></li>)}</ol> : null}
    </li>)}
  </ul>;
}

// Two bars per row (shortlisted vs the rest), each value printed so colour never carries the number.
function PairBars({ rows, max, tip, labels = ["Shortlisted", "Others"], unit = "" }) {
  const top = Math.max(1, max ?? Math.max(...rows.flatMap((r) => [r.a ?? 0, r.b ?? 0])));
  return <ul className="viz-pairs">
    <li className="viz-pairs-key" aria-hidden="true"><span /><span><i className="is-a" /> {labels[0]}</span><span><i className="is-b" /> {labels[1]}</span></li>
    {rows.map((r) => <li key={r.label} onMouseMove={(e) => tip.show(e, [r.title || r.label, `${labels[0]}: ${r.a ?? "–"}${unit}`, `${labels[1]}: ${r.b ?? "–"}${unit}`])} onMouseLeave={tip.hide}>
      <span className="viz-bar-label" title={r.title || r.label}>{r.label}</span>
      <span className="viz-pair-bars">
        <span className="viz-bar-track"><i className="is-a" style={{ width: `${((r.a ?? 0) / top) * 100}%` }} /></span>
        <span className="viz-bar-track"><i className="is-b" style={{ width: `${((r.b ?? 0) / top) * 100}%` }} /></span>
      </span>
      <b className="viz-bar-value">{r.a ?? "–"}<small> · {r.b ?? "–"}</small></b>
    </li>)}
  </ul>;
}

// Shortlist analysis: the top N teams by final Round 1 score compared with every scored team.
function ShortlistAnalysis({ headers, tip, onUnauthorized }) {
  const [top, setTop] = useState(160);
  const [draft, setDraft] = useState("160");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/admin/analytics/shortlist`, { headers, params: { top } })
      .then((r) => { if (alive) { setData(r.data); setError(""); } })
      .catch((e) => { if (e.response?.status === 401) onUnauthorized(); else if (alive) setError(e.response?.data?.message || "Unable to load the shortlist analysis."); });
    return () => { alive = false; };
  }, [top, headers, onUnauthorized]);
  const apply = (n) => { const v = Math.max(1, Number.parseInt(n, 10) || 160); setTop(v); setDraft(String(v)); };
  const rateItems = (rows) => rows.map((r) => ({ label: `${r.label} · ${r.count}/${r.of} (${r.rate}%)`, count: r.count }));

  return <section className="viz-shortlist" aria-label="Shortlist analysis">
    <header className="viz-shortlist-head">
      <div><h2>Shortlist analysis</h2><p>Top {data?.top ?? top} teams by final Round 1 score (the Shortlist order), compared with all {data?.scoredTeams ?? "…"} scored teams.</p></div>
      <div className="viz-shortlist-pick" role="group" aria-label="How many teams">
        {[60, 160].map((n) => <button key={n} type="button" className={top === n ? "is-on" : ""} onClick={() => apply(n)}>Top {n}</button>)}
        <form onSubmit={(e) => { e.preventDefault(); apply(draft); }}><input type="number" min="1" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Number of teams" /><button type="submit">Show</button></form>
      </div>
    </header>
    {error ? <p className="admin-error">{error}</p> : null}
    {!data && !error ? <p className="viz-empty">Loading shortlist analysis…</p> : null}
    {data ? <>
      <div className="viz-tiles">
        <div className="viz-tile"><small>Shortlisted</small><b>{data.top}</b><span>of {data.scoredTeams} scored PPTs ({pct(data.top, data.scoredTeams)}%)</span></div>
        <div className="viz-tile"><small>Cut-off score</small><b>{data.cutoff ?? "–"}</b><span>{data.nextScore !== null ? `next team below: ${data.nextScore}` : "no team below"}</span></div>
        <div className="viz-tile"><small>Average · median</small><b>{data.scores.top.average ?? "–"}</b><span>median {data.scores.top.median ?? "–"} · rest average {data.scores.rest.average ?? "–"}</span></div>
        <div className="viz-tile"><small>Score range</small><b>{data.scores.top.min ?? "–"}–{data.scores.top.max ?? "–"}</b><span>out of 100</span></div>
        <div className="viz-tile"><small>Colleges represented</small><b>{data.collegeCount}</b><span>{data.colleges[0] ? `most: ${data.colleges[0].label} (${data.colleges[0].count})` : ""}</span></div>
        <div className="viz-tile"><small>From Sathyabama</small><b>{data.hostSplit[0].count}</b><span>{data.hostSplit[0].rate}% of Sathyabama's {data.hostSplit[0].of} scored teams</span></div>
        <div className="viz-tile"><small>Cross-college teams</small><b>{data.crossCollege.top}</b><span>of {data.crossCollege.all} cross-college teams overall</span></div>
        <div className="viz-tile"><small>Participants</small><b>{data.people}</b><span>{data.top ? `${(data.people / data.top).toFixed(1)} per team` : ""}</span></div>
      </div>
      <div className="viz-grid">
        <ChartCard title="Score distribution" subtitle="Teams per 10-mark band: shortlisted vs the rest"
          table={{ columns: ["Score band", "Shortlisted", "Others"], rows: data.distribution.map((d) => [d.label, d.top, d.rest]) }}>
          <PairBars rows={[...data.distribution].reverse().filter((d) => d.top || d.rest).map((d) => ({ label: d.label, a: d.top, b: d.rest }))} tip={tip} />
        </ChartCard>
        <ChartCard title="What sets them apart" subtitle="Average level (0–5) per criterion on the counted sheets: shortlisted vs the rest"
          table={{ columns: ["Criterion", "Shortlisted", "Others", "Gap"], rows: data.criteria.map((c) => [`${c.id} ${c.name}`, c.top ?? "–", c.rest ?? "–", c.gap ?? "–"]) }}>
          <PairBars rows={data.criteria.map((c) => ({ label: c.id, title: c.name, a: c.top, b: c.rest }))} max={5} tip={tip} />
        </ChartCard>
        <ChartCard title="Colleges" subtitle="Shortlisted teams · shortlisted / scored (selection rate)"
          table={{ columns: ["College", "Shortlisted", "Scored", "Rate"], rows: data.colleges.map((r) => [r.label, r.count, r.of, `${r.rate}%`]) }}>
          <BarList items={rateItems(data.colleges)} tip={tip} showPercent={false} />
        </ChartCard>
        <ChartCard title="Themes" subtitle="Shortlisted teams per theme · selection rate"
          table={{ columns: ["Theme", "Shortlisted", "Scored", "Rate"], rows: data.themes.map((r) => [r.label, r.count, r.of, `${r.rate}%`]) }}>
          <BarList items={rateItems(data.themes)} tip={tip} showPercent={false} />
        </ChartCard>
        <ChartCard title="Sathyabama vs other colleges" table={{ columns: ["", "Shortlisted", "Scored", "Rate"], rows: data.hostSplit.map((r) => [r.label, r.count, r.of, `${r.rate}%`]) }}>
          <BarList items={rateItems(data.hostSplit)} tip={tip} showPercent={false} />
        </ChartCard>
        <ChartCard title="How they heard about DEXATHON" table={{ columns: ["Channel", "Teams"], rows: data.referral.map((r) => [r.label, r.count]) }}>
          <BarList items={data.referral} total={data.top} tip={tip} />
        </ChartCard>
        <ChartCard title="Year of study" subtitle="Participants in the shortlisted teams" table={{ columns: ["Year", "Participants"], rows: data.years.map((r) => [r.label, r.count]) }}>
          <BarList items={data.years} tip={tip} unit="people" showPercent={false} />
        </ChartCard>
        <ChartCard title="Departments" subtitle="Participants in the shortlisted teams" table={{ columns: ["Department", "Participants"], rows: data.departments.map((r) => [r.label, r.count]) }}>
          <BarList items={data.departments} tip={tip} unit="people" showPercent={false} />
        </ChartCard>
        <ChartCard title="Team size" subtitle="Shortlisted teams by number of people" table={{ columns: ["People", "Teams"], rows: data.sizes.map((r) => [r.label, r.count]) }}>
          <SizeColumns data={data.sizes} tip={tip} />
        </ChartCard>
        <ChartCard title="Round 1 decisions so far" subtitle="For the shortlisted teams (decide on Round Selection)" table={{ columns: ["Decision", "Teams"], rows: data.roundDecisions.map((r) => [r.label, r.count]) }}>
          <BarList items={data.roundDecisions} total={data.top} tip={tip} />
        </ChartCard>
      </div>
    </> : null}
  </section>;
}

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const token = getAdminToken();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const tip = useTooltip();
  const signOut = useCallback(() => { clearAdminSession(); navigate("/devleader/login"); }, [navigate]);

  const load = useCallback(({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    axios.get(`${API_URL}/admin/analytics`, { headers })
      .then((response) => { setData(response.data); setError(""); })
      .catch((requestError) => {
        if (requestError.response?.status === 401) { clearAdminSession(); navigate("/devleader/login"); return; }
        if (!silent) setError(requestError.response?.data?.message || "Unable to load analytics.");
      })
      .finally(() => { if (!silent) setRefreshing(false); });
  }, [headers, navigate]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const t = data?.totals;
  const tiles = t ? [
    ["Teams", t.teams, `${data.registrations.at(-1)?.count || 0} registered on ${data.registrations.length ? fmtDay(data.registrations.at(-1).label) : "-"}`],
    ["Participants", t.people, t.teams ? `${(t.people / t.teams).toFixed(1)} per team on average` : ""],
    ["Colleges", t.colleges, t.needsReview ? `${t.needsReview} team${t.needsReview === 1 ? "" : "s"} with a college still to review (Colleges page)` : data.colleges[0] ? `Most: ${data.colleges[0].label}` : ""],
    ["From Sathyabama", t.hostTeams, `${t.hostPeople} participants · ${t.teams - t.hostTeams} teams from other colleges`],
    ["Login emails sent", t.emailed, `${t.teams - t.emailed} still to send`],
    ["Round 1 PDFs", t.pdf, `${pct(t.pdf, t.teams)}% of teams submitted`],
    ["Round 2 prototypes", t.prototype, `${pct(t.prototype, t.teams)}% of teams submitted`],
    ["Complete profiles", t.completeTeams, "teams with every member's phone & email"],
    ["Cross-college teams", t.mixedTeams, `${data.crossCollege.people} people from ${data.crossCollege.collegesInvolved} colleges in mixed teams`],
    ["Top channel", data.referral.channels.find((c) => c.label !== "Not answered")?.label || "-", `${t.referralAnswered} of ${t.teams} teams said how they heard about DEXATHON`],
  ] : [];
  const channelsAnswered = data ? data.referral.channels.filter((c) => c.label !== "Not answered") : [];
  const channelMatrix = data ? { themes: channelsAnswered.map((c) => c.label), rows: data.referral.byCollege.map((r) => ({ college: r.college, counts: channelsAnswered.map((c) => r.channels.find((x) => x.label === c.label)?.count || 0) })) } : null;

  return <main className="admin-dashboard admin-analytics">
    <header>
      <h1>Analytics</h1>
      <nav><AdminNav /></nav>
    </header>
    <div className="viz-toolbar">
      <span>{data ? `Live data · updated ${fmtTime(data.generatedAt)} · refreshes every 30 seconds` : "Loading…"}</span>
      <button type="button" onClick={() => load()} disabled={refreshing}><RefreshCw size={14} className={refreshing ? "spin" : ""} /> Refresh</button>
    </div>
    {error ? <p className="admin-error">{error}</p> : null}

    {data ? <>
      <section className="viz-tiles" aria-label="Key figures">
        {tiles.map(([label, value, note]) => <div key={label} className="viz-tile"><small>{label}</small><b>{value}</b><span>{note}</span></div>)}
      </section>

      <ShortlistAnalysis headers={headers} tip={tip} onUnauthorized={signOut} />

      <h2 className="viz-section-title">All registrations</h2>
      <div className="viz-grid">
        <ChartCard wide title="Registrations per day" subtitle={`${t.teams} teams since ${data.registrations[0] ? fmtDay(data.registrations[0].label) : "-"}`}
          table={{ columns: ["Day", "Registered", "Running total"], rows: data.registrations.map((d) => [fmtDay(d.label), d.count, d.total]) }}>
          <DailyColumns data={data.registrations} tip={tip} />
        </ChartCard>

        <ChartCard title={<><Megaphone size={17} /> How teams heard about DEXATHON</>} subtitle={`"From where you know about this event" · ${t.referralAnswered} of ${t.teams} teams answered`}
          table={{ columns: ["Channel", "Teams", "%"], rows: data.referral.channels.map((x) => [x.label, x.count, `${pct(x.count, t.teams)}%`]) }}>
          <BarList items={data.referral.channels} total={t.teams} tip={tip} />
          {data.referral.otherAnswers.length ? <p className="viz-note">"Other" answers: {data.referral.otherAnswers.map((a) => `${a.label}${a.count > 1 ? ` (${a.count})` : ""}`).join(" · ")}</p> : null}
        </ChartCard>

        <ChartCard title="Channels · Sathyabama vs other colleges" subtitle="Which channels reached the host college and which reached outside"
          table={{ columns: ["Channel", "Sathyabama teams", "Other-college teams"], rows: data.referral.byHost.map((x) => [x.label, x.host, x.other]) }}>
          <BarList items={data.referral.byHost.map((x) => ({ label: `${x.label} · other colleges`, count: x.other }))} total={t.teams - t.hostTeams} tip={tip} showPercent={false} />
          <BarList items={data.referral.byHost.filter((x) => x.host).map((x) => ({ label: `${x.label} · Sathyabama`, count: x.host }))} tip={tip} showPercent={false} />
        </ChartCard>

        <ChartCard wide title="Channels by college" subtitle="How teams at the five largest colleges heard about the event">
          <ThemeByCollege data={channelMatrix} />
        </ChartCard>

        <ChartCard wide title={<><Shuffle size={17} /> Cross-college teams</>} subtitle={`${t.mixedTeams} team${t.mixedTeams === 1 ? "" : "s"} with members from more than one college (each member's own college, from the registration form or the Team Portal)`}>
          <CrossCollegeList data={data.crossCollege} />
        </ChartCard>

        <ChartCard wide title="Time of day teams registered" subtitle="Form submissions by hour (IST)"
          table={{ columns: ["Hour (IST)", "Teams"], rows: data.hours.map((h) => [hourRange(h.label), h.count]) }}>
          <Columns data={data.hours} tip={tip} labelOf={(d) => (d.label % 3 === 0 ? hourLabel(d.label) : "")} tipOf={(d) => [hourRange(d.label), `${d.count} team${d.count === 1 ? "" : "s"} registered`]} ariaLabel="Teams registered by hour of day" />
        </ChartCard>

        <ChartCard title="Day of the week" subtitle="Form submissions by weekday (IST)"
          table={{ columns: ["Day", "Teams", "%"], rows: data.weekdays.map((x) => [x.label, x.count, `${pct(x.count, t.teams)}%`]) }}>
          <BarList items={data.weekdays} total={t.teams} tip={tip} />
        </ChartCard>

        <ChartCard title="Event progress" subtitle="How many teams reached each step"
          table={{ columns: ["Step", "Teams", "% of teams"], rows: data.progress.map((p) => [p.label, p.count, `${pct(p.count, t.teams)}%`]) }}>
          <BarList items={data.progress} total={t.teams} tip={tip} />
        </ChartCard>

        <ChartCard title="Project themes" subtitle="Teams per theme"
          table={{ columns: ["Theme", "Teams", "%"], rows: data.themes.map((x) => [x.label, x.count, `${pct(x.count, t.teams)}%`]) }}>
          <BarList items={data.themes} total={t.teams} tip={tip} />
        </ChartCard>

        <ChartCard title="Colleges · teams" subtitle={`Top of ${t.colleges} colleges (spellings of one college counted together)`}
          table={{ columns: ["College", "Teams"], rows: data.colleges.map((x) => [x.label, x.count]) }}>
          <BarList items={data.colleges} tip={tip} showPercent={false} />
        </ChartCard>

        <ChartCard title="Colleges · participants" subtitle="People per college (each member's own college)"
          table={{ columns: ["College", "Participants"], rows: data.collegePeople.map((x) => [x.label, x.count]) }}>
          <BarList items={data.collegePeople} tip={tip} unit="people" showPercent={false} />
        </ChartCard>

        <ChartCard title="Sathyabama vs other colleges" subtitle={`${t.mixedTeams} cross-college team${t.mixedTeams === 1 ? "" : "s"} (see Cross-college teams)`}
          table={{ columns: ["", "Teams", "Participants"], rows: data.hostSplit.map((x) => [x.label, x.teams, x.people]) }}>
          <BarList items={data.hostSplit.map((x) => ({ label: `${x.label} · teams`, count: x.teams }))} total={t.teams} tip={tip} />
          <BarList items={data.hostSplit.map((x) => ({ label: `${x.label} · people`, count: x.people }))} tip={tip} unit="people" showPercent={false} />
        </ChartCard>

        <ChartCard title="Year of study" subtitle="Participants by year"
          table={{ columns: ["Year", "Participants", "%"], rows: data.years.map((x) => [x.label, x.count, `${pct(x.count, t.people)}%`]) }}>
          <BarList items={data.years} tip={tip} unit="people" showPercent={false} />
        </ChartCard>

        <ChartCard title="Departments" subtitle="Participants by department (spellings grouped)"
          table={{ columns: ["Department", "Participants"], rows: data.departments.map((x) => [x.label, x.count]) }}>
          <BarList items={data.departments} tip={tip} unit="people" showPercent={false} />
        </ChartCard>

        <ChartCard title="Round 2 prototypes" subtitle="Category of each submission"
          table={{ columns: ["Category", "Teams", "%"], rows: data.prototypeCategories.map((x) => [x.label, x.count, `${pct(x.count, t.teams)}%`]) }}>
          <BarList items={data.prototypeCategories} total={t.teams} tip={tip} />
        </ChartCard>

        <ChartCard title="Profile completeness" subtitle={`Share of the ${t.people} participants with each detail filled in`}
          table={{ columns: ["Detail", "Participants", "%"], rows: data.completeness.map((x) => [x.label, x.count, `${pct(x.count, t.people)}%`]) }}>
          <BarList items={data.completeness} tip={tip} unit="people" showPercent={false} />
          <p className="viz-note">{data.completeness.map((x) => `${x.label}: ${pct(x.count, t.people)}%`).join(" · ")}</p>
        </ChartCard>

        <ChartCard wide title="Themes by college" subtitle="Teams per theme at the six largest colleges">
          <ThemeByCollege data={data.themeByCollege} />
        </ChartCard>

        <ChartCard title="Login email status" table={{ columns: ["Status", "Teams", "%"], rows: data.emails.map((x) => [x.label, x.count, `${pct(x.count, t.teams)}%`]) }}>
          <StatusRows items={data.emails} total={t.teams} tip={tip} />
        </ChartCard>

        <ChartCard title="Team size" subtitle="Teams by number of people (Team Head counted once)"
          table={{ columns: ["People", "Teams"], rows: data.sizes.map((x) => [x.label, x.count]) }}>
          <SizeColumns data={data.sizes} tip={tip} />
        </ChartCard>

        <ChartCard title="Where teams came from" table={{ columns: ["Source", "Teams", "%"], rows: data.sources.map((x) => [x.label, x.count, `${pct(x.count, t.teams)}%`]) }}>
          <BarList items={data.sources} total={t.teams} tip={tip} />
        </ChartCard>

        <ChartCard wide title="Data to fix" subtitle="Click a row to see the teams">
          <HealthList items={data.health} />
        </ChartCard>

        <ChartCard wide title="College name matching" subtitle="Submitted spellings linked to one registry college. Manage aliases, merges and reviews on the Colleges page.">
          <CollegeGroups groups={data.collegeGroups} />
        </ChartCard>

        <ChartCard wide title={<><ShieldCheck size={17} /> Security</>} subtitle={`${data.security.activeAdmins} active admin account${data.security.activeAdmins === 1 ? "" : "s"} · ${data.security.lockedNow.length} login lockout${data.security.lockedNow.length === 1 ? "" : "s"} active · ${data.security.recentFailures} failed attempt${data.security.recentFailures === 1 ? "" : "s"} in the last 15 minutes`}>
          <div className="viz-table-scroll"><table className="viz-table">
            <thead><tr><th>Admin account</th><th>Role</th><th>Status</th><th>Last login</th></tr></thead>
            <tbody>{data.security.admins.map((a) => <tr key={a.username}><td>{a.username}{a.name ? <small> · {a.name}</small> : null}</td><td>{a.role}</td><td className={a.active ? "tone-good" : "tone-neutral"}>{a.active ? <><CheckCircle2 size={13} /> Active</> : <><XCircle size={13} /> Disabled</>}</td><td>{fmtTime(a.lastLoginAt)}</td></tr>)}</tbody>
          </table></div>
          {data.security.lockedNow.length ? <p className="viz-lock-note"><AlertTriangle size={14} /> Locked right now: {data.security.lockedNow.map((l) => `${l.key} (${l.minutes} min)`).join(", ")}</p> : null}
        </ChartCard>
      </div>
    </> : !error ? <p className="viz-empty">Loading analytics…</p> : null}
    {tip.node}
  </main>;
}

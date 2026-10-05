import { Award, CalendarDays, CircleCheck, FileText, MapPin, Music, Package, Users, Utensils, Zap } from "lucide-react";

const facts = [
  { label: "EVENT DATES", value: "4–5 NOVEMBER 2026", icon: CalendarDays },
  { label: "OFFICIAL VENUE", value: "INDOOR AUDITORIUM, SATHYABAMA", icon: MapPin },
  { label: "TEAM COMPOSITION", value: "4–6 FINALISTS PER TEAM", icon: Users },
  { label: "FINAL ROUND FEE", value: "₹250 / PARTICIPANT", icon: Zap },
];

const perks = [
  { tag: "HOSPITALITY", title: "Food & Accommodation Provided", text: "Complete nutritious meals, midnight snacks, beverages, and campus resting facilities provided for all final-round participants.", icon: Utensils, tone: "orange" },
  { tag: "FINALIST KIT", title: "Exclusive DEXATHON Kits", text: "Custom branded hackathon kit with participant credentials, tech stickers, official merchandise, and sponsor goodies for every finalist.", icon: Package, tone: "cyan" },
  { tag: "EXPERIENCE", title: "Fun Games & DJ Night", text: "High-energy midnight engagement sessions, interactive mini-challenges, fun games, and DJ sets to keep the spirit alive.", icon: Music, tone: "orange" },
  { tag: "INNOVATION", title: "24-Hour Non-Stop Hacking", text: "Uninterrupted high-speed Wi-Fi, power backup, technical mentoring by industry experts, and continuous judging rounds.", icon: Zap, tone: "cyan" },
];

const fees = [
  { label: "ENTRY FEES", value: "₹300", note: "/ TEAM (4–6 members)", tone: "orange" },
  { label: "FINAL ROUND", value: "₹250", note: "/ person (qualifying teams)", tone: "cyan" },
  { label: "TEAM SIZE", value: "4–6", note: "members per team", tone: "orange" },
];

export default function FinalSprint() {
  return (
    <section className="home-dark-section home-final" id="final-round">
      <div className="home-section-inner">
        <header className="home-center-heading">
          <span className="home-pill is-orange"><i />CHAMPIONSHIP STAGE</span>
          <h2>24-HOUR <em className="is-cyan">FINAL SPRINT</em></h2>
          <p>The pinnacle of DEXATHON 2026. Selected finalists converge at Sathyabama Institute of Science and Technology for an uninterrupted 24-hour physical hackathon to build, test, and crown the champions.</p>
        </header>

        <div className="home-final-facts">
          {facts.map(({ label, value, icon: Icon }) => (
            <div key={label}>
              <Icon size={18} />
              <span><small>{label}</small><strong>{value}</strong></span>
            </div>
          ))}
        </div>

        <div className="home-final-perks">
          {perks.map(({ tag, title, text, icon: Icon, tone }) => (
            <article className={`home-perk-card is-${tone}`} key={title}>
              <div className="home-perk-top">
                <span>{tag}</span>
                <i><Icon size={18} /></i>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
              <footer><CircleCheck size={13} /> GUARANTEED BENEFIT</footer>
            </article>
          ))}
        </div>

        <div className="home-panel home-recognition">
          <small className="home-panel-label">CERTIFICATION &amp; RECOGNITION</small>
          <h3>Official Participant Recognition</h3>
          <div className="home-recognition-grid">
            <article className="is-cyan">
              <div className="home-recognition-top"><span>ROUND 1 &amp; ROUND 2</span><i><FileText size={18} /></i></div>
              <h4>E-Certificates for All Participants</h4>
              <p>E-certificates will be distributed to Round 1 &amp; Round 2 participants.</p>
              <footer><CircleCheck size={13} /> Verified Digital Certificate</footer>
            </article>
            <article className="is-gold">
              <div className="home-recognition-top"><span>FINAL ROUND QUALIFIERS</span><i><Award size={18} /></i></div>
              <h4>Physical Certificates for Finalists</h4>
              <p>Physical certificates will be provided to finalists / final-round qualified team participants.</p>
              <footer><CircleCheck size={13} /> Official Physical Certificate at Sathyabama</footer>
            </article>
          </div>
        </div>

        <div className="home-panel home-fees">
          <small className="home-panel-label is-cyan">STAGE-BASED PRICING</small>
          <h3>Direct &amp; Transparent Fee Structure</h3>
          <p>DEXATHON 2026 follows a simple two-phase fee structure. No hidden costs or surprise surcharges.</p>
          <div className="home-fee-chips">
            {fees.map((fee) => (
              <div className={`is-${fee.tone}`} key={fee.label}>
                <small>{fee.label}</small>
                <strong>{fee.value}</strong>
                <span>{fee.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

import { CalendarDays, MapPin, Trophy, Users, Zap } from "lucide-react";

// Compact event information bar shown under the navigation.
const items = [
  { label: "FORMAT", value: "24-HOUR AI HACKATHON", icon: Zap, tone: "orange" },
  { label: "EVENT DATES", value: "4–5 NOVEMBER 2026", icon: CalendarDays, tone: "cyan" },
  { label: "VENUE", value: "INDOOR AUDITORIUM, SATHYABAMA", icon: MapPin, tone: "cyan" },
  { label: "TEAM SIZE", value: "4–6 MEMBERS", icon: Users, tone: "cyan" },
  { label: "PRIZE POOL", value: "UP TO ₹50,000", icon: Trophy, tone: "gold" },
];

export default function StatusHud() {
  return (
    <section className="home-event-info" aria-label="Event information">
      <div className="home-event-info-inner">
        {items.map(({ label, value, icon: Icon, tone }) => (
          <div className={`home-info-chip is-${tone}`} key={label}>
            <Icon size={17} aria-hidden="true" />
            <div><span>{label}</span><strong>{value}</strong></div>
          </div>
        ))}
      </div>
    </section>
  );
}

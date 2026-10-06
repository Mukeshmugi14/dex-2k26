import { CalendarDays, Lightbulb, Rocket, Settings, Trophy, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./MobileJourney.css";

// Phone-only Trainer Journey: a vertical mission path instead of the wide desktop artwork.
// Dates match the desktop journey map and the Key Competition Dates.
const stages = [
  { tag: "START", title: "Registration", detail: "Team registration opens", date: "05 OCT 2026", icon: Users },
  { tag: "MISSION 01", title: "Round 1", detail: "Idea Discovery", date: "20 OCT 2026", icon: Lightbulb },
  { tag: "MISSION 02", title: "Round 2", detail: "Prototype Development", date: "30 OCT 2026", icon: Settings },
  { tag: "MISSION 03", title: "Final Round", detail: "24-Hour Hackathon", date: "4–5 NOV 2026", icon: Rocket },
  { tag: "CHAMPION", title: "Winners & Prizes", detail: "Champions Crowned", date: "5 NOV 2026", icon: Trophy, final: true },
];

export default function MobileJourney() {
  const rootRef = useRef(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  // Start the path and stage animations once the section scrolls into view.
  useEffect(() => {
    if (visible || !rootRef.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.12 });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div className={`mobile-journey ${visible ? "is-visible" : ""}`} ref={rootRef}>
      <header className="mj-banner">
        <img src="/trainer-journey-mobile.jpg" alt="" width="1100" height="407" loading="lazy" decoding="async" />
        <div className="mj-banner-text">
          <span>DEXATHON 2026</span>
          <h2>TRAINER <em>JOURNEY</em></h2>
          <p>FROM IDEAS TO CHAMPION</p>
        </div>
      </header>

      <p className="mj-intro">Complete all missions and become the <b>DEXATHON Champion!</b></p>

      <ol className="mj-path" aria-label="DEXATHON 2026 journey stages">
        {stages.map(({ tag, title, detail, date, icon: Icon, final }, index) => (
          <li className={`mj-stage ${final ? "is-final" : ""}`} style={{ "--i": index }} key={title}>
            <span className="mj-node" aria-hidden="true"><b /></span>
            <div className="mj-card">
              <div className="mj-card-top">
                <span className="mj-tag">{tag}</span>
                <Icon size={18} aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{detail}</p>
              <time><CalendarDays size={13} aria-hidden="true" /> {date}</time>
            </div>
          </li>
        ))}
      </ol>

      <p className="mj-footer">IDEAS <i>→</i> BUILD <i>→</i> IMPACT</p>
    </div>
  );
}

import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Crosshair,
  MapPin,
  Radar,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const TARGET_DATE = new Date("2026-11-04T10:30:00+05:30").getTime();

function getCountdown() {
  const seconds = Math.floor(Math.max(0, TARGET_DATE - Date.now()) / 1000);
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}

const pad = (value) => String(value ?? 0).padStart(2, "0");

const details = [
  { label: "DATE", value: "4–5 NOV 2026", icon: CalendarDays },
  { label: "VENUE", value: "INDOOR AUDITORIUM", icon: MapPin },
  { label: "TEAM SIZE", value: "4–6 MEMBERS", icon: Users },
  { label: "DURATION", value: "24 HOURS", icon: Clock3 },
];

function HeroContent({ countdown }) {
  const countdownItems = [
    { label: "DAYS", value: countdown.days },
    { label: "HRS", value: countdown.hours },
    { label: "MIN", value: countdown.minutes },
    { label: "SEC", value: countdown.seconds },
  ];

  return (
    <motion.div
      className="home-hero-content"
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <p className="home-hero-kicker"><span />OFFICIAL 24-HOUR NATIONAL HACKATHON</p>

      <h1 className="home-hero-title" aria-label="DEXATHON 2026">
        <span className="home-hero-title-main" aria-hidden="true">
          DEXATH<i className="home-hero-ball" /><span>N</span>
        </span>
        <span className="home-hero-title-year" aria-hidden="true">2026</span>
      </h1>

      <div className="home-hero-organizer">
        <small>ORGANIZED BY</small>
        <strong>Department of Computer Applications</strong>
      </div>

      <span className="home-hero-tag">24-HOUR PHYSICAL HACKATHON</span>

      <p className="home-hero-tagline">
        Catch Ideas. Build Solutions. <em>Become a Champion.</em>
      </p>

      <EventDetails />

      <div className="home-hero-actions">
        <Link to="/register" className="home-hero-primary">START YOUR JOURNEY <ArrowRight size={16} /></Link>
        <a href="#rounds" className="home-hero-secondary">EXPLORE DEXATHON <Radar size={15} /></a>
      </div>
      <a href="#rules" className="home-hero-link">VIEW RULES <ArrowRight size={13} /></a>

      <div className="home-hero-countdown" aria-label="Countdown to DEXATHON 2026">
        {countdownItems.map((item) => (
          <div key={item.label}>
            <strong>{pad(item.value)}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function EventDetails() {
  return (
    <div className="home-hero-details">
      {details.map(({ label, value, icon: Icon }) => (
        <div className="home-hero-detail" key={label}>
          <Icon size={16} aria-hidden="true" />
          <div><span>{label}</span><strong>{value}</strong></div>
        </div>
      ))}
    </div>
  );
}

function HeroVisual() {
  return (
    <motion.div
      className="home-hero-visual"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
    >
      <div className="home-visual-logo">
        <img src="/assets/branding/sathyabama-logo.png" alt="Sathyabama Institute of Science and Technology" width="1024" height="272" />
      </div>

      <div className="home-visual-frame">
        <div className="home-visual-campus">
          <img src="/sathyabama-campus.jpg" alt="Sathyabama Institute of Science and Technology campus" />
          <div className="home-visual-shade" />
          <div className="home-visual-grid" />
          <div className="home-visual-scan" />

          <div className="home-visual-top">
            <span>LOCATION SCAN</span>
            <b>CHENNAI HQ</b>
          </div>
          <div className="home-visual-hq">DEXATHON HQ</div>

          <div className="home-visual-status">
            <span>SCAN</span><strong>ONLINE</strong>
            <i />
            <span>MISSION</span><strong>ACTIVE</strong>
          </div>

          <div className="home-visual-target">
            <Crosshair size={52} />
            <span><Target size={11} /> TARGET LOCKED</span>
          </div>

          <div className="home-visual-caption">
            <strong><Sparkles size={12} /> SATHYABAMA INSTITUTE OF SCIENCE AND TECHNOLOGY</strong>
            <small>INDOOR AUDITORIUM · CHENNAI, TAMIL NADU</small>
          </div>
        </div>
      </div>

      <div className="home-visual-cards">
        <div className="home-visual-mini is-cyan">
          <div><span>TEAM ELIGIBILITY</span><strong>4–6 MEMBERS</strong></div>
          <CheckCircle2 size={20} />
        </div>
        <div className="home-visual-mini is-orange">
          <i className="home-visual-mini-icon"><Zap size={16} /></i>
          <div><span>MISSION STATUS</span><strong>READY TO BUILD</strong></div>
          <b>DX26</b>
        </div>
      </div>
    </motion.div>
  );
}

export default function Hero() {
  const [countdown, setCountdown] = useState(getCountdown);

  useEffect(() => {
    const interval = setInterval(() => setCountdown(getCountdown()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="home-hero" id="home">
      <div className="home-hero-inner">
        <HeroContent countdown={countdown} />
        <HeroVisual />
      </div>
    </section>
  );
}

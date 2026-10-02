import {
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  FileText,
  Gamepad2,
  Home,
  Mail,
  Menu,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const navItems = [
  { label: "HOME", icon: Home },
  { label: "ABOUT", icon: CircleUserRound },
  { label: "TIMELINE", icon: CalendarDays },
  { label: "RULES", icon: FileText },
  { label: "ROUNDS", icon: Gamepad2 },
  { label: "FINAL ROUND", icon: ShieldCheck },
  { label: "PRIZES", icon: Trophy },
  { label: "SCHEDULE", icon: CalendarDays },
  { label: "FAQ", icon: Sparkles },
  { label: "CONTACT", icon: Mail },
];

const toHref = (label) => `#${label.toLowerCase().replaceAll(" ", "-")}`;

export default function MainNavigation() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className="dex-nav">

      <div className="dex-nav-inner">

        <div className="pokedex-logo">
          <div className="pokedex-ring">
            <div className="pokedex-center" />
          </div>
        </div>

        <nav className="dex-nav-links">
          {navItems.map(({ label, icon: Icon }) => (
            <a
              href={toHref(label)}
              key={label}
            >
              <Icon size={11} />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <div className="dex-nav-register">
          <Link to="/register">
            REGISTER NOW
            <ChevronRight size={17} />
          </Link>
        </div>

        <button
          type="button"
          className="dex-mobile-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="dex-mobile-panel"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

      </div>

      {menuOpen && (
        <nav id="dex-mobile-panel" className="dex-mobile-panel" aria-label="Mobile navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <a href={toHref(label)} key={label} onClick={() => setMenuOpen(false)}>
              <Icon size={14} />
              <span>{label}</span>
            </a>
          ))}
          <Link className="dex-mobile-register" to="/register" onClick={() => setMenuOpen(false)}>
            REGISTER NOW
            <ChevronRight size={17} />
          </Link>
        </nav>
      )}

    </header>
  );
}

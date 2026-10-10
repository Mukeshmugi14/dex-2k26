import { ArrowRight, LayoutDashboard, Shield, Users } from "lucide-react";
import { Link } from "react-router-dom";
import "./PortalGateway.css";

export default function PortalGateway() {
  return (
    <main className="portal-gateway">
      <div className="portal-gateway-glow glow-blue" aria-hidden="true" />
      <div className="portal-gateway-glow glow-orange" aria-hidden="true" />

      <div className="portal-gateway-container">
        <header>
          <div className="portal-brand">
            DE<b>X</b>ATHON <em>2026</em>
          </div>
          <h1 className="portal-gateway-title">Dexathon 2K26 Portal</h1>
          <p className="portal-gateway-subtitle">
            Welcome to the official DEXATHON 2026 management portal. Access your team registration or administrative dashboard.
          </p>
        </header>

        <section className="portal-cards-grid">
          {/* Team Head Portal */}
          <article className="portal-card">
            <div className="portal-card-icon">
              <Users size={26} />
            </div>
            <span className="portal-card-tag">For Participating Teams</span>
            <h2>Team Head Portal</h2>
            <p>
              Log in with your assigned Team ID (e.g. DEX26001) and password to view your team profile, track round selection results, and submit project deliverables.
            </p>
            <Link to="/team-login" className="portal-card-btn">
              Enter Team Portal <ArrowRight size={16} />
            </Link>
          </article>

          {/* Admin Dashboard */}
          <article className="portal-card card-admin">
            <div className="portal-card-icon">
              <Shield size={26} />
            </div>
            <span className="portal-card-tag">For Event Coordinators</span>
            <h2>Admin Dashboard</h2>
            <p>
              Import Google Sheets registrations, view team lists, send branded confirmation emails, evaluate PDF submissions, and configure round progression.
            </p>
            <Link to="/admin/login" className="portal-card-btn">
              Admin Sign In <ArrowRight size={16} />
            </Link>
          </article>
        </section>

        <footer className="portal-gateway-footer">
          <div>Department of Computer Applications & Computer Science</div>
          <span>Sathyabama Institute of Science and Technology &bull; DEXATHON 2026</span>
        </footer>
      </div>
    </main>
  );
}

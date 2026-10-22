import { ArrowRight, Shield, Users } from "lucide-react";
import { Link } from "react-router-dom";
import "./PortalGateway.css";
import { ADMIN_ENABLED } from "../config/adminAvailability";

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
            {ADMIN_ENABLED
              ? "Welcome to the official DEXATHON 2026 management portal. Access your team registration or administrative dashboard."
              : "Welcome to the official DEXATHON 2026 portal. Log in to the Team Head Portal to manage your team and submissions."}
          </p>
        </header>

        <section className={`portal-cards-grid${ADMIN_ENABLED ? "" : " is-single"}`}>
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

          {/* Admin Dashboard: local development only */}
          {ADMIN_ENABLED ? <article className="portal-card card-admin">
            <div className="portal-card-icon">
              <Shield size={26} />
            </div>
            <span className="portal-card-tag">For Event Coordinators</span>
            <h2>Admin Dashboard</h2>
            <p>
              Import Google Sheets registrations, view team lists, send branded confirmation emails, evaluate PDF submissions, and configure round progression.
            </p>
            <Link to="/devleader/login" className="portal-card-btn">
              Admin Sign In <ArrowRight size={16} />
            </Link>
          </article> : null}
        </section>

        <p className="portal-evaluator-link">Round 1 evaluator? <Link to="/evaluator/login">Evaluator sign-in</Link></p>

        <footer className="portal-gateway-footer">
          <div>Department of Computer Applications & Computer Science</div>
          <span>Sathyabama Institute of Science and Technology &bull; DEXATHON 2026</span>
        </footer>
      </div>
    </main>
  );
}

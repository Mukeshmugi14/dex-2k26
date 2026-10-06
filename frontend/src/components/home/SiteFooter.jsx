import { ChevronRight, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { InstagramButton, LinkedInIcon } from "./SocialIcons";

const exploreLinks = [
  { label: "Home Overview", href: "#home" },
  { label: "About DEXATHON", href: "#about" },
  { label: "Trainer Journey Map", href: "#timeline" },
  { label: "3-Stage Missions", href: "#rounds" },
  { label: "Official Rulebook", href: "#rules" },
];

const championshipLinks = [
  { label: "Final 24H Sprint", href: "#final-round" },
  { label: "Event Schedule", href: "#schedule" },
  { label: "Prizes & Recognition", href: "#prizes" },
  { label: "Team Registration", to: "/register" },
  { label: "HelpDex FAQs", href: "#faq" },
];

const developers = [
  { name: "Aravinth S.", role: "Frontend Developer", linkedin: "https://www.linkedin.com/in/aravinth-s-893519376/" },
  { name: "Sudharshan R.", role: "Backend Developer", linkedin: "https://www.linkedin.com/in/sudharshan-rengaraj-90394b295" },
];

function FooterLinks({ title, links }) {
  return (
    <nav className="home-footer-links" aria-label={title}>
      <h4>{title}</h4>
      <ul>
        {links.map((link) => (
          <li key={link.label}>
            {link.to
              ? <Link to={link.to}><ChevronRight size={13} /> {link.label}</Link>
              : <a href={link.href}><ChevronRight size={13} /> {link.label}</a>}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function SiteFooter() {
  return (
    <footer className="home-footer">
      <div className="home-footer-inner">
        <div className="home-footer-grid">
          <div className="home-footer-brand">
            <a className="home-brand" href="#home" aria-label="DEXATHON 2026 home">
              <span className="home-brand-mark" aria-hidden="true"><i className="home-brand-ball"><b /></i></span>
              <span className="home-brand-text">
                <strong>DEXATHON <em>2026</em></strong>
                <small className="is-orange">24-HOUR AI HACKATHON</small>
              </span>
            </a>
            <p>Organized by the Department of Computer Applications, Sathyabama Institute of Science and Technology, Chennai. In association with SnapServe AI and Space Zee Technologies.</p>
            <div className="home-footer-institute">
              <strong>SATHYABAMA</strong>
              <span>INSTITUTE OF SCIENCE AND TECHNOLOGY</span>
              <small>Deemed to be University · Chennai, Tamil Nadu</small>
            </div>
          </div>

          <FooterLinks title="EXPLORE EVENT" links={exploreLinks} />
          <FooterLinks title="CHAMPIONSHIP" links={championshipLinks} />

          <div className="home-footer-support">
            <h4>VENUE &amp; SUPPORT</h4>
            <div className="home-footer-venue">
              <MapPin size={15} />
              <div><strong>Indoor Auditorium</strong><small>Sathyabama Institute of Science and Technology, Chennai</small></div>
            </div>
            <a href="#contact" className="home-footer-coordinators">View Event Coordinators &amp; Faculty</a>
            <small className="home-footer-partners-label">ASSOCIATE PARTNERS:</small>
            <div className="home-footer-partners"><span>SnapServe AI</span><span>Space Zee Tech</span></div>
            <small className="home-footer-partners-label">FOLLOW US:</small>
            <InstagramButton />
          </div>
        </div>

        <div className="home-footer-credits">
          <div>
            <small>ENGINEERED BY</small>
            <strong>DEVELOPED BY</strong>
          </div>
          <div className="home-footer-devs">
            {developers.map((dev) => (
              <div className="home-footer-dev" key={dev.name}>
                <div><strong>{dev.name}</strong><small>{dev.role}</small></div>
                <a href={dev.linkedin} target="_blank" rel="noreferrer" aria-label={`${dev.name} on LinkedIn`}><LinkedInIcon /> LinkedIn</a>
              </div>
            ))}
          </div>
        </div>

        <div className="home-footer-bottom">
          <span>© 2026 DEXATHON · Sathyabama Institute of Science and Technology. All Rights Reserved.</span>
          <strong>Catch Ideas. Build Solutions. Become a Champion.</strong>
        </div>
      </div>
    </footer>
  );
}

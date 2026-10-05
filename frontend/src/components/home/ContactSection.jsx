import { Building2, ExternalLink, GraduationCap, Info, MapPin, Phone, Users } from "lucide-react";
import { InstagramIcon, LinkedInIcon } from "./SocialIcons";

const officials = [
  { name: "Dr. Mariazeena Johnson", role: "Chancellor" },
  { name: "Dr. Marie Johnson", role: "President" },
  { name: "Dr. S. Maria Bernadette Arul Selvan", role: "Vice President" },
  { name: "Dr. R. AROUL CANESSANE", role: "Head of the Department — MCA" },
];

const faculty = [
  { name: "Dr. P. Tamilselvi", role: "Faculty Organizer" },
  { name: "Dr. R. Rajeshwari", role: "Faculty Organizer" },
  { name: "Dr. J. Palani Meera", role: "Faculty Organizer" },
  { name: "Mr. B. Stalin Victor", role: "Faculty Organizer" },
];

const students = [
  { name: "Mukesh M.", phone: "+91 97909 17850", linkedin: "https://www.linkedin.com/in/mukesh-gramini", instagram: "https://www.instagram.com/journeywithmugi" },
  { name: "Cyril Jones", phone: "+91 97515 61948", linkedin: "https://www.linkedin.com/in/cyril-jones-582b161a1" },
  { name: "M.S. Viswa Shree", phone: "+91 73056 29539", linkedin: "https://www.linkedin.com/in/m-s-viswa-shree-7b8755358" },
  { name: "Pragalya R.", phone: "+91 87546 63949" },
];

const initial = (name) => name.replace(/^(Dr|Mr|Ms|Mrs)\.\s*/i, "").charAt(0).toUpperCase();

function Person({ name, role, tone, children }) {
  return (
    <li className="home-person">
      <span className={`home-person-avatar is-${tone}`}>{initial(name)}</span>
      <div>
        <strong>{name}</strong>
        <small>{role}</small>
        {children}
      </div>
    </li>
  );
}

export default function ContactSection() {
  return (
    <section className="home-dark-section home-contact" id="contact">
      <div className="home-section-inner">
        <header className="home-center-heading">
          <span className="home-pill is-orange"><i />ORGANIZING COMMITTEE &amp; CONTACT</span>
          <h2>GET IN <em className="is-cyan">TOUCH.</em></h2>
          <p>Have queries regarding registrations, PPT submissions, rules, or logistics? Reach out to the DEXATHON 2026 coordinators and organizing team.</p>
        </header>

        <div className="home-contact-grid">
          <div className="home-contact-column">
            <h3><Building2 size={16} /> UNIVERSITY OFFICIALS</h3>
            <ul>{officials.map((person) => <Person key={person.name} {...person} tone="cyan" />)}</ul>
          </div>

          <div className="home-contact-column">
            <h3><GraduationCap size={16} /> FACULTY ORGANIZERS</h3>
            <ul>{faculty.map((person) => <Person key={person.name} {...person} tone="cyan" />)}</ul>
          </div>

          <div className="home-contact-column">
            <h3><Users size={16} /> STUDENT ORGANIZERS</h3>
            <ul>
              {students.map((person) => (
                <Person key={person.name} name={person.name} role="Student Organizer" tone="orange">
                  <div className="home-person-links">
                    <a href={`tel:${person.phone.replace(/\s/g, "")}`} className="home-person-phone"><Phone size={12} /> {person.phone}</a>
                    {person.linkedin ? <a href={person.linkedin} target="_blank" rel="noreferrer" className="home-social is-linkedin"><LinkedInIcon /> LinkedIn</a> : null}
                    {person.instagram ? <a href={person.instagram} target="_blank" rel="noreferrer" className="home-social is-instagram"><InstagramIcon /> Instagram</a> : null}
                  </div>
                </Person>
              ))}
            </ul>
            <p className="home-contact-note"><Info size={14} /> For urgent event &amp; PPT queries, contact student coordinators directly.</p>
          </div>
        </div>

        <div className="home-venue">
          <div className="home-venue-main">
            <small className="home-panel-label"><MapPin size={14} /> OFFICIAL EVENT VENUE</small>
            <h3>Indoor Auditorium, Sathyabama</h3>
            <address>
              Sathyabama Institute of Science and Technology (Deemed to be University)<br />
              Jeppiaar Nagar, Rajiv Gandhi Salai (OMR),<br />
              Chennai, Tamil Nadu – 600 119, India.
            </address>
            <div className="home-venue-facts">
              <div><small>LANDMARK</small><strong>OMR IT Corridor, Chennai</strong></div>
              <div><small>FACILITIES</small><strong>Air-Conditioned, High-Speed WiFi, Power Hubs</strong></div>
            </div>
            <a className="home-maps-button" href="https://maps.google.com/?q=Sathyabama+Institute+of+Science+and+Technology+Chennai" target="_blank" rel="noreferrer">
              OPEN IN GOOGLE MAPS <ExternalLink size={14} />
            </a>
          </div>

          <aside className="home-venue-partners">
            <small className="home-panel-label is-cyan">IN ASSOCIATION WITH</small>
            <div className="home-partner">
              <img src="/assets/branding/snapserve-logo.png" alt="" loading="lazy" />
              <div><strong>SnapServe AI</strong><small>Technology Partner</small></div>
            </div>
            <div className="home-partner">
              <img src="/assets/branding/spacezee-logo.png" alt="" loading="lazy" />
              <div><strong>Space Zee Technologies</strong><small>Innovation Partner</small></div>
            </div>
            <div className="home-venue-organizer">
              <small>ORGANIZED BY:</small>
              <strong>Department of Computer Applications</strong>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

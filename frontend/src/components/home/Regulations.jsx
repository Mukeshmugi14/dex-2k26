import { Award, CircleCheck, FileText, Layers, Users } from "lucide-react";
import { useState } from "react";

const tabs = [
  {
    key: "general",
    label: "GENERAL RULES",
    icon: Users,
    rules: [
      { badge: "4–6 Members", title: "Team Size & Composition", text: "Each team must consist strictly of 4 to 6 members. Solo participants or teams of fewer than 4 or more than 6 will not be permitted." },
      { badge: "Valid Student ID", title: "Student Identification", text: "All participants must be enrolled students and possess a valid college/institution ID card for on-spot verification during the final round." },
      { badge: "Zero Plagiarism", title: "Originality & Integrity", text: "All submissions, codebases, and presentations must be original work created by the participating team. Plagiarism will lead to immediate disqualification." },
      { badge: "Single Entry", title: "One Submission Per Team", text: "Each registered team may submit only one project idea through their designated Team Leader. Multiple entries are strictly prohibited." },
    ],
  },
  {
    key: "round1",
    label: "ROUND 1: PPT",
    icon: FileText,
    rules: [
      { badge: "Official Template", title: "Official PPT Template Requirement", text: "Teams must present their hackathon idea using the official PPT template provided by the organizers without altering its core slide structure." },
      { badge: "20 OCT · 11:00 PM", title: "Submission Deadline", text: "Round 1 registration and PPT submission closes promptly on 20 October 2026 at 11:00 PM IST. Late submissions will not be evaluated." },
      { badge: "PPT/PPTX · Max 10MB", title: "File Format & Size Limit", text: "Submissions must be in PPT or PPTX format with a maximum file size of 10 MB uploaded through the official portal." },
      { badge: "Results 25 OCT", title: "Evaluation Weightage", text: "Problem Understanding (20%), Innovation (20%), Proposed Solution (25%), Technical Feasibility (20%), Presentation Clarity (15%). Results on 25 Oct 2026 at 7:00 PM." },
    ],
  },
  {
    key: "round2",
    label: "ROUND 2: PROTOTYPE",
    icon: Layers,
    rules: [
      { badge: "Round 1 Qualifiers", title: "Eligibility", text: "Only teams qualified from Round 1 are eligible to participate in Round 2. The prototype must be an implementation or refinement of the Round 1 concept." },
      { badge: "30 OCT · 11:00 PM", title: "Prototype Deadline", text: "The prototype and documentation submission portal closes on 30 October 2026 at 11:00 PM IST." },
      { badge: "Working Prototype", title: "Required Deliverables", text: "Teams must submit a working demo link / GitHub repository link, project documentation, technology stack details, and optional demonstration video." },
      { badge: "Results 02 NOV", title: "Evaluation Weightage", text: "Functionality (25%), Innovation (20%), Technical Implementation (20%), UI/UX (15%), Feasibility (10%), Demo (10%). Results on 2 Nov 2026 at 7:00 PM." },
    ],
  },
  {
    key: "final",
    label: "FINAL 24H SPRINT",
    icon: Award,
    rules: [
      { badge: "4–5 NOV 2026", title: "Physical On-Campus Event", text: "The final round is a 24-hour on-campus hackathon conducted at the Indoor Auditorium, Sathyabama Institute of Science and Technology, Chennai." },
      { badge: "₹250 / Participant", title: "Final Round Fee Calculation", text: "Registration fee for final round qualifiers is ₹250 per participant (₹1,000 for 4 members, ₹1,250 for 5 members, ₹1,500 for 6 members)." },
      { badge: "Live 24H Build", title: "Code Development Protocol", text: "Major feature development and integration must take place within the 24-hour hackathon window. Standard open-source libraries and APIs are permitted." },
      { badge: "Live Demo", title: "Live Judging & Valedictory", text: "Teams must demonstrate their solution live to the panel of industry & academic judges. Winners will be crowned at the Valedictory function on 5 Nov at 10:30 AM." },
    ],
  },
];

export default function Regulations() {
  const [active, setActive] = useState(tabs[0].key);
  const current = tabs.find((tab) => tab.key === active);

  return (
    <section className="home-dark-section home-rules" id="rules">
      <div className="home-section-inner">
        <header className="home-center-heading">
          <span className="home-pill"><i />RULEBOOK &amp; GUIDELINES</span>
          <h2>OFFICIAL <em>REGULATIONS.</em></h2>
          <p>Review the official competitive guidelines for DEXATHON 2026 to ensure your team progresses smoothly from idea discovery to the championship.</p>
        </header>

        <div className="home-rules-tabs" role="tablist" aria-label="Rule categories">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              role="tab"
              key={key}
              id={`home-rules-tab-${key}`}
              aria-selected={active === key}
              aria-controls="home-rules-panel"
              className={active === key ? "is-active" : ""}
              onClick={() => setActive(key)}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        <div className="home-rules-grid" id="home-rules-panel" role="tabpanel" aria-labelledby={`home-rules-tab-${active}`}>
          {current.rules.map((rule, index) => (
            <article className="home-rule-card" key={rule.title}>
              <div className="home-rule-top">
                <b>RULE #{index + 1}</b>
                <span>{rule.badge}</span>
              </div>
              <h3>{rule.title}</h3>
              <p>{rule.text}</p>
              <footer><CircleCheck size={13} /> OFFICIAL SPECIFICATION</footer>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

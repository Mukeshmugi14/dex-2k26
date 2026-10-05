import {
  CalendarDays,
  Clock3,
  MapPin,
  Trophy,
  Users,
  Zap,
  ArrowUpRight,
} from "lucide-react";

import "./EventSchedule.css";

const keyDates = [
  { stage: "OPEN", date: "5 OCT 2026", when: "Monday", event: "Registration Opens", tone: "blue" },
  { stage: "DEADLINE", date: "20 OCT 2026", when: "Tuesday · 11 PM", event: "Round 1 PPT Submission Closes", tone: "orange" },
  { stage: "RESULTS", date: "25 OCT 2026", when: "Sunday · 7 PM", event: "Round 1 Results Announced", tone: "blue" },
  { stage: "DEADLINE", date: "30 OCT 2026", when: "Friday · 11 PM", event: "Round 2 Prototype Closes", tone: "orange" },
  { stage: "RESULTS", date: "2 NOV 2026", when: "Monday · 7 PM", event: "Round 2 Results Announced", tone: "blue" },
  { stage: "FINALE", date: "4–5 NOV 2026", when: "Wed – Thu", event: "Final 24-Hour On-Campus Hackathon", tone: "cyan" },
];

const dayOne = [
  {
    time: "08:00 AM – 09:00 AM",
    title: "ON-SPOT REGISTRATION",
    description: "Registration and confirmation for final-round participants.",
    icon: Users,
  },
  {
    time: "09:30 AM",
    title: "INAUGURATION",
    description: "Official inauguration of DEXATHON 2026.",
    icon: Zap,
  },
  {
    time: "10:30 AM",
    title: "HACKATHON BEGINS",
    description: "The final 24-hour hackathon officially starts.",
    icon: Clock3,
  },
];

const dayTwo = [
  {
    time: "10:30 AM",
    title: "HACKATHON ENDS",
    description: "Final project submission and completion of the 24-hour build.",
    icon: Clock3,
  },
  {
    time: "10:30 AM – 11:30 AM",
    title: "VALEDICTORY & WINNER ANNOUNCEMENT",
    description: "Valedictory function followed by the winner announcement.",
    icon: Trophy,
  },
];

const prizes = [
  {
    position: "01",
    label: "WINNER",
    title: "CHAMPION",
    icon: "🏆",
    description: "Cash Prize + Recognition",
  },
  {
    position: "02",
    label: "1ST RUNNER-UP",
    title: "RUNNER-UP",
    icon: "🥈",
    description: "Cash Prize + Recognition",
  },
  {
    position: "03",
    label: "2ND RUNNER-UP",
    title: "RUNNER-UP",
    icon: "🥉",
    description: "Cash Prize + Recognition",
  },
];

export default function EventSchedule() {
  return (
    <section className="event-schedule-section" id="schedule">
      <div className="event-schedule-container">

        {/* SECTION HEADER */}
        <div className="event-section-header">
          <div className="event-section-label">
            <span />
            EVENT SCHEDULE
          </div>

          <div className="event-header-row">
            <div>
              <h2>
                FOLLOW THE
                <strong>MISSION.</strong>
              </h2>

              <p>
                Keep track of the final-round schedule and
                important event-day activities.
              </p>
            </div>

            <div className="event-date-badge">
              <CalendarDays size={18} />
              <div>
                <strong>04–05 NOV 2026</strong>
                <span>SATHYABAMA · CHENNAI</span>
              </div>
            </div>
          </div>
        </div>

        {/* KEY COMPETITION DATES */}
        <div className="key-dates">
          <h3>KEY COMPETITION DATES</h3>
          <div className="key-dates-grid">
            {keyDates.map((item) => (
              <article className={`key-date is-${item.tone}`} key={item.event}>
                <span>{item.stage}</span>
                <strong>{item.date}</strong>
                <em>{item.when}</em>
                <p>{item.event}</p>
              </article>
            ))}
          </div>
        </div>

        {/* SCHEDULE */}
        <div className="schedule-layout">

          {/* DAY 01 */}
          <div className="schedule-day">
            <div className="schedule-day-header">
              <div>
                <span>DAY 01</span>
                <strong>04 NOVEMBER 2026</strong>
              </div>

              <b>FINAL ROUND</b>
            </div>

            <div className="schedule-list">
              {dayOne.map((item) => {
                const Icon = item.icon;

                return (
                  <div className="schedule-item" key={item.time}>

                    <div className="schedule-time">
                      {item.time}
                    </div>

                    <div className="schedule-icon">
                      <Icon size={18} />
                    </div>

                    <div className="schedule-content">
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </div>

                    <ArrowUpRight
                      className="schedule-arrow"
                      size={17}
                    />

                  </div>
                );
              })}
            </div>
          </div>

          {/* DAY 02 */}
          <div className="schedule-day">
            <div className="schedule-day-header">
              <div>
                <span>DAY 02</span>
                <strong>05 NOVEMBER 2026</strong>
              </div>

              <b>CHAMPIONSHIP</b>
            </div>

            <div className="schedule-list">
              {dayTwo.map((item) => {
                const Icon = item.icon;

                return (
                  <div className="schedule-item" key={item.time}>

                    <div className="schedule-time">
                      {item.time}
                    </div>

                    <div className="schedule-icon">
                      <Icon size={18} />
                    </div>

                    <div className="schedule-content">
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </div>

                    <ArrowUpRight
                      className="schedule-arrow"
                      size={17}
                    />

                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* VENUE STRIP */}
        <div className="schedule-venue-strip">

          <div className="venue-strip-icon">
            <MapPin size={20} />
          </div>

          <div>
            <span>FINAL ROUND VENUE</span>
            <strong>INDOOR AUDITORIUM</strong>
            <small>
              Sathyabama Institute of Science and Technology, Chennai
            </small>
          </div>

          <div className="venue-strip-date">
            <CalendarDays size={15} />
            04–05 NOV 2026
          </div>

        </div>

        {/* PRIZES */}
        <div className="prizes-block" id="prizes">

          <div className="prizes-header">
            <div>
              <div className="event-section-label">
                <span />
                WINNERS &amp; PRIZES
              </div>

              <h2>
                BECOME THE
                <strong>CHAMPION.</strong>
              </h2>

              <p>
                Compete, build and earn recognition at the
                DEXATHON 2026 final round.
              </p>
            </div>

            <div className="prize-pool">
              <span>OVERALL PRIZE POOL</span>
              <strong>UP TO ₹50,000</strong>
            </div>
          </div>

          <div className="prize-grid">

            {prizes.map((prize) => (
              <article className="prize-card" key={prize.position}>

                <div className="prize-number">
                  {prize.position}
                </div>

                <div className="prize-medal">
                  {prize.icon}
                </div>

                <span className="prize-label">
                  {prize.label}
                </span>

                <h3>{prize.title}</h3>

                <p>{prize.description}</p>

                <div className="prize-card-footer">
                  <span>DEXATHON 2026</span>
                  <Trophy size={13} />
                </div>

              </article>
            ))}

          </div>

          <div className="prize-note">
            <Trophy size={16} />
            <span>
              Exact prize amounts for each position will be
              configured and displayed later by the organizers.
            </span>
          </div>

        </div>

      </div>
    </section>
  );
}
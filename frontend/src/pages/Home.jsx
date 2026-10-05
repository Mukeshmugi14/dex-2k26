import BrandingStrip from "../components/BrandingStrip";
import MainNavigation from "../components/MainNavigation";
import StatusHud from "../components/StatusHud";
import Hero from "../components/Hero";
import TrainerJourney from "../components/TrainerJourney";
import TrainerChallenges from "../components/TrainerChallenges";
import TrainerCards from "../components/TrainerCards";
import EventSchedule from "../components/EventSchedule";
import HelpDex from "../components/HelpDex";
import ProblemThemes from "../components/home/ProblemThemes";
import Regulations from "../components/home/Regulations";
import FinalSprint from "../components/home/FinalSprint";
import JoinMission from "../components/home/JoinMission";
import ContactSection from "../components/home/ContactSection";
import SiteFooter from "../components/home/SiteFooter";
import "./Home.css";
import "./HomeSections.css";

export default function Home() {
  return (
    <div className="home-page">
      {/* STICKY NAVIGATION */}
      <MainNavigation />

      {/* EVENT INFORMATION BAR */}
      <StatusHud />

      <main>
        {/* HERO */}
        <Hero />

        {/* PARTNER / ACCREDITATION LOGOS */}
        <BrandingStrip />

        {/* KNOW YOUR DEXATHON */}
        <div className="home-know-section">
          <TrainerCards />
        </div>

        {/* TRAINER JOURNEY */}
        <TrainerJourney />

        {/* ACCEPT THE CHALLENGE */}
        <TrainerChallenges />

        {/* PROBLEM STATEMENT THEMES */}
        <ProblemThemes />

        {/* OFFICIAL REGULATIONS */}
        <Regulations />

        {/* 24-HOUR FINAL SPRINT */}
        <FinalSprint />

        {/* EVENT SCHEDULE + WINNERS & PRIZES */}
        <EventSchedule />

        {/* JOIN THE MISSION */}
        <JoinMission />

        {/* HELPDEX / FAQ */}
        <HelpDex />

        {/* CONTACT + VENUE */}
        <ContactSection />
      </main>

      <SiteFooter />
    </div>
  );
}

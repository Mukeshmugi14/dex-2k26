import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import MobileJourney from "./MobileJourney";

// Phones get a vertical mission path instead of the wide artwork (and skip downloading the 2.6 MB image).
const PHONE_QUERY = "(max-width: 767px)";
const matchesPhone = () => typeof window !== "undefined" && window.matchMedia?.(PHONE_QUERY).matches;

function useIsPhone() {
  const [isPhone, setIsPhone] = useState(matchesPhone);
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return isPhone;
}

export default function TrainerJourney() {
  const isPhone = useIsPhone();

  if (isPhone) {
    return (
      <section className="trainer-journey-section is-mobile" id="timeline">
        <MobileJourney />
      </section>
    );
  }

  return (
    <section className="trainer-journey-section" id="timeline">
      <div className="trainer-journey-visual">

        {/* Main generated Trainer Journey artwork */}
        <motion.img
          src="/trainer-journey-map.png"
          alt="DEXATHON 2026 Trainer Journey"
          className="trainer-journey-image"
          initial={{
            opacity: 0,
            scale: 1.025,
          }}
          whileInView={{
            opacity: 1,
            scale: 1,
          }}
          viewport={{
            once: true,
            amount: 0.15,
          }}
          transition={{
            duration: 1.1,
            ease: "easeOut",
          }}
        />

        {/* Very subtle cinematic lighting layer */}
        <motion.div
          className="trainer-journey-glow"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{
            once: true,
            amount: 0.15,
          }}
          transition={{
            duration: 1.4,
          }}
        />

        {/* Animated scan line */}
        <motion.div
          className="trainer-journey-scan"
          animate={{
            x: ["-100%", "200%"],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "linear",
          }}
        />

      </div>
    </section>
  );
}
import { motion } from "framer-motion";

export default function TrainerJourney() {
  return (
    <section className="trainer-journey-section" id="timeline">
      <div className="trainer-journey-visual">
        <motion.img
          src="/trainer-journey-map.png"
          alt="DEXATHON 2026 Trainer Journey"
          className="trainer-journey-image"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />

        <motion.div
          className="trainer-journey-glow"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 1.4 }}
        />

        <motion.div
          className="trainer-journey-scan"
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
        />
      </div>
    </section>
  );
}

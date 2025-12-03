import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";

// 1. Define your page titles here
const PAGE_TITLES: Record<string, string> = {
  "/": "Home",
  "/notes": "Notes",
  "/forecast": "Forecast Lab",
};

export const TransitionCurtain = () => {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || "DeepCast";

  // Common transition settings for sync
  // Using a slightly slower ease for a "heavy" premium feel
  const curtainTransition = { duration: 0.8, ease: [0.76, 0, 0.24, 1] };

  return (
    <>
      {/* ENTRANCE CURTAIN (The Reveal)
        - Active when the NEW page mounts.
        - Starts at 0% (Covering screen) to match the Exit Curtain's end position.
        - Slides to -100% (Up) to reveal the new content.
      */}
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--paper-ink)] text-[var(--paper-bg)] pointer-events-none"
        initial={{ y: "0%" }}
        animate={{ y: "-100%" }}
        transition={curtainTransition}
        aria-hidden
      >
        {/* Text reveals/hides opposite to curtain movement */}
        <motion.div
          initial={{ opacity: 1, y: 0 }}
          animate={{ opacity: 0, y: -60 }}
          transition={{ duration: 0.5, ease: "easeIn" }}
          className="flex flex-col items-center gap-2"
        >
          <h1 className="kaito-serif text-4xl font-light tracking-tight md:text-6xl">
            {title}
          </h1>
        </motion.div>
      </motion.div>

      {/* EXIT CURTAIN (The Cover)
        - Active when the OLD page unmounts.
        - Starts at 100% (Hidden at bottom).
        - Slides to 0% (Covering screen).
      */}
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--paper-ink)] text-[var(--paper-bg)] pointer-events-none"
        initial={{ y: "100%" }}
        animate={{ y: "100%" }} // Stays at bottom while page is active
        exit={{ y: "0%" }} // Slides up to cover on exit
        transition={curtainTransition}
        aria-hidden
      >
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          exit={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="flex flex-col items-center gap-2"
        >
          <h1 className="kaito-serif text-4xl font-light tracking-tight md:text-6xl">
            {title}
          </h1>
        </motion.div>
      </motion.div>
    </>
  );
};

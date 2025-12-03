import { motion, useAnimationControls, usePresence } from "framer-motion";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { fluidEase } from "./PageWrapper";

// Map paths to display titles
const ROUTE_TITLES: Record<string, string> = {
  "/": "Home",
  "/notes": "Field Notes",
  "/forecast": "Forecast Lab",
};

export const TransitionCurtain = () => {
  const [isPresent, safeToRemove] = usePresence();
  const controls = useAnimationControls();
  const location = useLocation();

  // Determine title based on current path, fallback to "DeepCast"
  const title = ROUTE_TITLES[location.pathname] || "DeepCast";

  useEffect(() => {
    if (!isPresent) {
      // EXIT: The curtain slides up away to reveal the new page
      controls
        .start({
          y: "-100%",
          transition: { duration: 0.5, ease: [0.76, 0, 0.24, 1] },
        })
        .then(() => safeToRemove());
      return;
    }

    // ENTRANCE: cover, brief pause, then lift to reveal
    const runEntrance = async () => {
      controls.set({ y: "100%" });
      await controls.start({
        y: "0%",
        transition: { duration: 0.5, ease: fluidEase },
      });
      await controls.start({
        y: "-100%",
        transition: { duration: 0.6, ease: [0.83, 0, 0.17, 1], delay: 0.1 },
      });
    };

    void runEntrance();
  }, [controls, isPresent, safeToRemove]);

  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a19] text-[#f7f5f0]"
      initial={{ y: "100%" }}
      animate={controls}
    >
      {/* Text Container
        We use a separate motion div for the text to create a subtle parallax
        or stagger effect against the curtain movement.
      */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={
          isPresent
            ? { opacity: 1, y: 0 }
            : { opacity: 0, y: -24 }
        }
        transition={
          isPresent
            ? { duration: 0.55, delay: 0.15, ease: "easeOut" }
            : { duration: 0.25, ease: "easeInOut" }
        }
        className="flex flex-col items-center gap-2"
      >
        <h1 className="kaito-serif text-4xl font-light tracking-tight md:text-6xl">{title}</h1>

        {/* Optional decorative loading bar or subtext */}
        <motion.div
          className="h-[1px] w-12 bg-white/20"
          initial={{ width: 0 }}
          animate={{ width: 48 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        />
      </motion.div>
    </motion.div>
  );
};

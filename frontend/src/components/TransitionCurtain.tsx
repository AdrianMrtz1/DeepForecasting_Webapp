import { motion, useAnimationControls, usePresence } from "framer-motion";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { fluidEase } from "./PageWrapper";

// 1. Define your page titles here
const PAGE_TITLES: Record<string, string> = {
  "/": "Home",
  "/notes": "Notes",
  "/forecast": "Forecast Lab",
};

export const TransitionCurtain = () => {
  const [isPresent, safeToRemove] = usePresence();
  const curtainControls = useAnimationControls();
  const textControls = useAnimationControls();
  const location = useLocation();

  // 2. Determine the title based on the current path
  const title = PAGE_TITLES[location.pathname] || "DeepCast";

  useEffect(() => {
    const playEntrance = async () => {
      curtainControls.set({ y: "100%" });
      textControls.set({ opacity: 0, y: 16 });

      // Cover the screen
      await curtainControls.start({
        y: "0%",
        transition: { duration: 0.5, ease: fluidEase },
      });

      // Bring the title in while the screen is covered
      await textControls.start({
        opacity: 1,
        y: 0,
        transition: { duration: 0.35, ease: "easeOut", delay: 0.05 },
      });

      // Hold briefly so the title is readable while the curtain is covering
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Lift the curtain away
      await curtainControls.start({
        y: "-100%",
        transition: { duration: 0.6, ease: [0.83, 0, 0.17, 1], delay: 0.05 },
      });

      // Gently fade the title as the curtain clears
      await textControls.start({
        opacity: 0,
        y: -14,
        transition: { duration: 0.25, ease: "easeInOut" },
      });
    };

    const playExit = async () => {
      // Snap the curtain back to cover, then slide away while removing
      curtainControls.set({ y: "0%" });
      textControls.set({ opacity: 1, y: 0 });

      await curtainControls.start({
        y: "-100%",
        transition: { duration: 0.55, ease: [0.76, 0, 0.24, 1] },
      });

      await textControls.start({
        opacity: 0,
        y: -12,
        transition: { duration: 0.2, ease: "easeIn" },
      });

      safeToRemove();
    };

    if (isPresent) {
      void playEntrance();
    } else {
      void playExit();
    }
  }, [curtainControls, textControls, isPresent, safeToRemove, location.pathname]);

  return (
    <motion.div
      aria-hidden
      // 3. Flex container to center the text
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--paper-ink)] text-[var(--paper-bg)]"
      initial={{ y: "100%" }}
      animate={curtainControls}
    >
      {/* 4. Text Animation Container */}
      <motion.div
        className="flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: 16 }}
        animate={textControls}
      >
        <h1 className="kaito-serif text-4xl font-light tracking-tight md:text-6xl">
          {title}
        </h1>

        {/* Optional decorative loading line */}
        <motion.div
          className="h-[1px] w-12 bg-[var(--paper-bg)]/30"
          initial={{ width: 0 }}
          animate={{ width: 48 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        />
      </motion.div>
    </motion.div>
  );
};

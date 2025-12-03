import { motion, useAnimationControls, usePresence } from "framer-motion";
import { useEffect } from "react";

import { fluidEase } from "./PageWrapper";

export const TransitionCurtain = () => {
  const [isPresent, safeToRemove] = usePresence();
  const controls = useAnimationControls();

  useEffect(() => {
    if (isPresent) {
      controls.set({ y: "100%" });
      controls.start({
        y: "-120%",
        transition: { duration: 0.9, ease: fluidEase },
      });
    } else {
      controls
        .start({
          y: "0%",
          transition: { duration: 0.55, ease: fluidEase },
        })
        .then(() => safeToRemove());
    }
  }, [controls, isPresent, safeToRemove]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 bg-[var(--paper-ink)]"
      initial={false}
      animate={controls}
    />
  );
};

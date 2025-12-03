import { motion } from "framer-motion";
import type { ComponentType, ReactNode } from "react";

import { fluidEase } from "../PageWrapper";

type RevealTextProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: keyof JSX.IntrinsicElements | ComponentType<{ className?: string }>;
};

// Masked slide-up reveal for titles and numbers
export const RevealText = ({
  children,
  className,
  delay = 0,
  as: Component = "span",
}: RevealTextProps) => {
  return (
    <Component className={`relative inline-block overflow-hidden ${className ?? ""}`}>
      <motion.span
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.95, ease: fluidEase, delay }}
        className="block will-change-transform"
      >
        {children}
      </motion.span>
    </Component>
  );
};

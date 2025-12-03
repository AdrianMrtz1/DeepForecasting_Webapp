import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

// Snappy start, slow settle to mimic editorial scroll sites
export const fluidEase = [0.25, 1, 0.5, 1] as const;

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
      ease: fluidEase,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.4, ease: fluidEase },
  },
};

export const itemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 40,
    filter: "blur(4px)",
  },
  show: (custom = 0) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 1.1,
      ease: fluidEase,
      delay: custom,
    },
  }),
  exit: {
    opacity: 0,
    y: 12,
    filter: "blur(6px)",
    transition: { duration: 0.45, ease: fluidEase },
  },
};

type PageWrapperProps = {
  children: ReactNode;
  className?: string;
};

export const PageWrapper = ({ children, className }: PageWrapperProps) => {
  return (
    <motion.section className={className} variants={containerVariants} initial="hidden" animate="show" exit="exit">
      {children}
    </motion.section>
  );
};

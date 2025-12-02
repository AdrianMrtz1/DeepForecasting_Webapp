import { cubicBezier, motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const calmEase = cubicBezier(0.6, 0.01, -0.05, 0.9);

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      ease: calmEase,
      duration: 0.8,
      delayChildren: 0.08,
      staggerChildren: 0.14,
      when: "beforeChildren",
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.45, ease: calmEase },
  },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: calmEase },
  },
  exit: {
    opacity: 0,
    y: -12,
    transition: { duration: 0.4, ease: calmEase },
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

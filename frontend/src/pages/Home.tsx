import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cubicBezier, motion } from "framer-motion";

import { PageWrapper, itemVariants } from "../components/PageWrapper";

type WaveSpec = { stroke: string; delay: number; speed: number; offset: number; opacity: number };

const createWavePath = (amplitude: number, verticalOffset: number) => {
  const baseY = 90 + verticalOffset;
  return `M 0 ${baseY} C 320 ${baseY + amplitude} 640 ${baseY - amplitude} 960 ${baseY} S 1280 ${
    baseY + amplitude
  } 1600 ${baseY}`;
};

export const Home = () => {
  const [cursorX, setCursorX] = useState(0.5);

  const waves = useMemo<WaveSpec[]>(
    () => [
      { stroke: "rgba(26,26,26,0.32)", delay: 0, speed: 14, offset: -10, opacity: 0.75 },
      { stroke: "rgba(26,26,26,0.26)", delay: 0.4, speed: 16, offset: 6, opacity: 0.65 },
      { stroke: "rgba(26,26,26,0.18)", delay: 0.8, speed: 18, offset: 20, opacity: 0.6 },
      { stroke: "rgba(26,26,26,0.12)", delay: 1, speed: 20, offset: 34, opacity: 0.5 },
    ],
    [],
  );

  const amplitudeScale = 0.6 + (1 - Math.min(1, Math.abs(0.5 - cursorX) * 2)) * 0.6;

  const cardEase = cubicBezier(0.33, 1, 0.68, 1);

  const cardVariants = {
    hidden: { opacity: 0, y: 18 },
    show: (i = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: cardEase, delay: i * 0.06 },
    }),
  };

  return (
    <PageWrapper className="space-y-16 pb-10 md:space-y-20">
      <motion.section
        variants={itemVariants}
        className="relative overflow-hidden rounded-[24px] border border-[var(--paper-border)] bg-[var(--paper-surface)] p-8 shadow-sm md:p-12"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width;
          setCursorX(Math.min(1, Math.max(0, x)));
        }}
        onMouseLeave={() => setCursorX(0.5)}
      >
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[rgba(255,255,255,0.6)] to-[rgba(255,255,255,0.9)]" />
          <svg viewBox="0 0 1600 240" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            {waves.map((wave) => (
              <motion.path
                key={wave.delay}
                d={createWavePath(20 * amplitudeScale, wave.offset)}
                stroke={wave.stroke}
                strokeWidth="1.1"
                strokeLinecap="round"
                fill="none"
                style={{ opacity: wave.opacity, transformOrigin: "center" }}
                animate={{ translateY: [-6, 6, -6], scaleY: 0.98 + amplitudeScale * 0.05 }}
                transition={{
                  duration: wave.speed,
                  delay: wave.delay,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatType: "mirror",
                }}
              />
            ))}
          </svg>
        </div>
        <div className="relative space-y-7">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--paper-muted)]">Product Engineer — Data Storytelling</p>
          <div className="space-y-4">
            <h1 className="text-4xl leading-tight text-[var(--paper-ink)] md:text-5xl">
              Calm forecasting workspace built to feel like a well-kept notebook.
            </h1>
            <p className="max-w-2xl text-lg text-[var(--paper-muted)]">
              Upload a CSV, explore baselines, and compare models with restrained motion cues that keep the analysis focused.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/forecast"
              className="rounded-full bg-[var(--paper-ink)] px-7 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--paper-surface)] shadow-[0_12px_32px_rgba(0,0,0,0.18)] transition hover:translate-y-[-2px] hover:shadow-[0_16px_40px_rgba(0,0,0,0.2)]"
            >
              Open the Lab
            </Link>
            <span className="rounded-full border border-[var(--paper-border)] bg-[var(--paper-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--paper-muted)]">
              Minimal motion
            </span>
            <span className="rounded-full border border-[var(--paper-border)] bg-[var(--paper-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--paper-muted)]">
              Calm palettes
            </span>
          </div>
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="space-y-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--paper-muted)]">Selected Work</p>
            <h2 className="text-3xl text-[var(--paper-ink)]">Forecasting Lab</h2>
          </div>
          <div className="text-sm uppercase tracking-[0.14em] text-[var(--paper-muted)]">Live environment</div>
        </div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid gap-5 md:grid-cols-3 md:grid-rows-2"
        >
          <motion.article
            variants={cardVariants}
            custom={0}
            className="card-hover relative overflow-hidden rounded-[18px] border border-[var(--paper-border)] bg-[var(--paper-surface)] p-6 shadow-sm md:row-span-2"
          >
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-[var(--paper-muted)]">
              <span>Product thinking — Data storytelling</span>
              <span>01</span>
            </div>
            <h3 className="mt-4 text-2xl leading-tight text-[var(--paper-ink)]">Forecasting Lab</h3>
            <p className="mt-3 text-[var(--paper-muted)]">
              Upload time series, benchmark models, and visualize probabilistic forecasts in a calm, notebook-inspired UI.
            </p>
            <Link to="/forecast" className="mt-5 inline-flex items-center gap-3 text-sm font-semibold text-[var(--paper-ink)] link-underline">
              Open
              <span className="h-[1px] w-16 bg-[var(--paper-ink)]" />
            </Link>
          </motion.article>

          <motion.article
            variants={cardVariants}
            custom={1}
            className="card-hover rounded-[18px] border border-[var(--paper-border)] bg-[var(--paper-surface)] p-6 shadow-sm md:col-span-2"
          >
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--paper-muted)]">About</p>
            <h3 className="mt-3 text-xl text-[var(--paper-ink)]">Building calm, intentional tools.</h3>
            <p className="mt-3 text-[var(--paper-muted)]">
              I split my time between forecasting research, thoughtful UI systems, and writing notes that help others move faster. The
              common thread is clarity: helping teams see the signal, not the noise.
            </p>
          </motion.article>

          <motion.article
            variants={cardVariants}
            custom={2}
            className="card-hover rounded-[18px] border border-[var(--paper-border)] bg-[var(--paper-surface)] p-6 shadow-sm md:col-span-2"
          >
            <div className="grid gap-3 text-[var(--paper-muted)] sm:grid-cols-2 sm:gap-4">
              {[
                { label: "Current focus", value: "Probabilistic forecasting, UX for data tools" },
                { label: "Tooling", value: "React / Tailwind / Framer Motion / TypeScript" },
                { label: "Principle", value: "Design with restraint; animate with purpose." },
                { label: "Location", value: "Remote / open to collaboration" },
              ].map((item) => (
                <div key={item.label} className="rounded-[14px] border border-[var(--paper-border)] bg-[var(--paper-soft)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--paper-muted)]">{item.label}</p>
                  <p className="mt-2 text-[var(--paper-ink)]">{item.value}</p>
                </div>
              ))}
            </div>
          </motion.article>
        </motion.div>
      </motion.section>
    </PageWrapper>
  );
};

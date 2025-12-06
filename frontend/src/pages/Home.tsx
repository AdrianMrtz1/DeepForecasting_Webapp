import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cubicBezier, motion, useMotionValue, useScroll, useTransform } from "framer-motion";

import { PageWrapper, itemVariants } from "../components/PageWrapper";
import { HomeLoader } from "../components/HomeLoader";

type WaveSpec = { stroke: string; delay: number; speed: number; offset: number; opacity: number };

const createWavePath = (amplitude: number, baseline: number, bend: number) => {
  const controlA = 320 + bend;
  const controlB = 640 - bend;

  return `M 0 ${baseline} C ${controlA} ${baseline + amplitude} ${controlB} ${baseline - amplitude} 960 ${baseline} S 1280 ${
    baseline + amplitude
  } 1600 ${baseline}`;
};

export const Home = () => {
  const [cursorX, setCursorX] = useState(0.5);
  const cursorInfluence = useMotionValue(1);
  const pageRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: pageRef,
    offset: ["start start", "end 70%"],
  });

  const waves = useMemo<WaveSpec[]>(
    () => [
      { stroke: "rgba(26,26,26,0.32)", delay: 0, speed: 14, offset: -10, opacity: 0.75 },
      { stroke: "rgba(26,26,26,0.26)", delay: 0.4, speed: 16, offset: 6, opacity: 0.65 },
      { stroke: "rgba(26,26,26,0.18)", delay: 0.8, speed: 18, offset: 20, opacity: 0.6 },
      { stroke: "rgba(26,26,26,0.12)", delay: 1, speed: 20, offset: 34, opacity: 0.5 },
    ],
    [],
  );

  useEffect(() => {
    const closeness = 1 - Math.min(1, Math.abs(0.5 - cursorX) * 2);
    const influence = 0.75 + closeness * 0.55;
    cursorInfluence.set(influence);
  }, [cursorX, cursorInfluence]);

  const gradientShift = useTransform(
    scrollYProgress,
    [0, 1],
    [
      "radial-gradient(circle at 18% 22%, rgba(12,15,23,0.06), transparent 45%), linear-gradient(180deg, rgba(255,255,255,0.7), rgba(247,245,240,0.55))",
      "radial-gradient(circle at 82% 68%, rgba(194,91,0,0.12), transparent 54%), linear-gradient(180deg, rgba(244,240,232,0.9), rgba(229,221,207,0.45))",
    ],
  );
  const strokeDepth = useTransform(scrollYProgress, [0, 1], [0.86, 1.08]);
  const amplitude = useTransform(scrollYProgress, [0, 1], [18, 34]);
  const baseline = useTransform(scrollYProgress, [0, 1], [82, 128]);
  const bend = useTransform(scrollYProgress, [0, 1], [-22, 18]);

  const wavePathPrimary = useTransform([amplitude, baseline, bend, cursorInfluence], ([amp, base, bendValue, influence]) =>
    createWavePath(amp * influence, base + waves[0]?.offset, bendValue * 1.05),
  );
  const wavePathSecondary = useTransform([amplitude, baseline, bend, cursorInfluence], ([amp, base, bendValue, influence]) =>
    createWavePath(amp * 0.92 * influence, base + waves[1]?.offset, bendValue * 0.8),
  );
  const wavePathTertiary = useTransform([amplitude, baseline, bend, cursorInfluence], ([amp, base, bendValue, influence]) =>
    createWavePath(amp * 0.82 * influence, base + waves[2]?.offset, bendValue * 0.65),
  );
  const wavePathQuaternary = useTransform([amplitude, baseline, bend, cursorInfluence], ([amp, base, bendValue, influence]) =>
    createWavePath(amp * 0.74 * influence, base + waves[3]?.offset, bendValue * 0.45),
  );

  const waveParallaxPrimary = useTransform(scrollYProgress, [0, 1], [0, -26]);
  const waveParallaxSecondary = useTransform(scrollYProgress, [0, 1], [0, -18]);
  const waveParallaxTertiary = useTransform(scrollYProgress, [0, 1], [0, -14]);
  const waveParallaxQuaternary = useTransform(scrollYProgress, [0, 1], [0, -10]);

  const cardParallaxA = useTransform(scrollYProgress, [0, 1], [0, -16]);
  const cardParallaxB = useTransform(scrollYProgress, [0, 1], [0, -22]);
  const cardParallaxC = useTransform(scrollYProgress, [0, 1], [0, -30]);
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
    <div ref={pageRef}>
      <HomeLoader />
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
          <motion.div className="absolute inset-0" style={{ background: gradientShift }} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[rgba(255,255,255,0.65)] to-[rgba(255,255,255,0.92)]" />
          <svg viewBox="0 0 1600 240" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            <motion.path
              d={wavePathPrimary}
              stroke={waves[0]?.stroke}
              strokeWidth="1.1"
              strokeLinecap="round"
              fill="none"
              style={{ opacity: waves[0]?.opacity, y: waveParallaxPrimary, scaleY: strokeDepth }}
            />
            <motion.path
              d={wavePathSecondary}
              stroke={waves[1]?.stroke}
              strokeWidth="1.05"
              strokeLinecap="round"
              fill="none"
              style={{ opacity: waves[1]?.opacity, y: waveParallaxSecondary, scaleY: strokeDepth }}
            />
            <motion.path
              d={wavePathTertiary}
              stroke={waves[2]?.stroke}
              strokeWidth="1"
              strokeLinecap="round"
              fill="none"
              style={{ opacity: waves[2]?.opacity, y: waveParallaxTertiary, scaleY: strokeDepth }}
            />
            <motion.path
              d={wavePathQuaternary}
              stroke={waves[3]?.stroke}
              strokeWidth="0.95"
              strokeLinecap="round"
              fill="none"
              style={{ opacity: waves[3]?.opacity, y: waveParallaxQuaternary, scaleY: strokeDepth }}
            />
          </svg>
          <div className="relative space-y-7">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--paper-muted)]">Product Engineer / Data Storytelling</p>
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
            className="grid auto-rows-[minmax(160px,auto)] gap-5 md:grid-cols-12"
          >
            <motion.article
              variants={cardVariants}
              custom={0}
              style={{ y: cardParallaxA }}
              className="card-hover relative overflow-hidden rounded-[18px] border border-[var(--paper-border)] bg-[var(--paper-surface)] p-6 shadow-sm md:col-span-7 md:row-span-2"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-[var(--paper-muted)]">
                <span>Product thinking / Data storytelling</span>
                <span>01</span>
              </div>
              <h3 className="mt-4 text-2xl leading-tight text-[var(--paper-ink)]">Forecasting Lab</h3>
              <p className="mt-3 text-[var(--paper-muted)]">
                Upload time series, benchmark models, and visualize probabilistic forecasts in a calm, notebook-inspired UI.
              </p>
              <Link
                to="/forecast"
                className="mt-5 inline-flex items-center gap-3 text-sm font-semibold text-[var(--paper-ink)] link-underline"
              >
                Open
                <span className="h-[1px] w-16 bg-[var(--paper-ink)]" />
              </Link>
            </motion.article>

            <motion.article
              variants={cardVariants}
              custom={1}
              style={{ y: cardParallaxB }}
              className="card-hover rounded-[18px] border border-[var(--paper-border)] bg-[var(--paper-surface)] p-6 shadow-sm md:col-span-5"
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
              style={{ y: cardParallaxC }}
              className="card-hover rounded-[18px] border border-[var(--paper-border)] bg-[var(--paper-surface)] p-6 shadow-sm md:col-span-5"
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
    </div>
  );
};

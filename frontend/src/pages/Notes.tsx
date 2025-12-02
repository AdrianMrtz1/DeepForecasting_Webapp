import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { motion } from "framer-motion";

import { PageWrapper, itemVariants } from "../components/PageWrapper";

const noteMarkdown = `
# Deep Forecasting Web App

React + FastAPI implementation of the Nixtla project: upload a CSV, pick target/date columns, run econometric/ML/neural models, benchmark them with rolling backtests, and compare results in a single UI.

## Stack
- Frontend: Vite + React + Tailwind (lab-style layout, benchmark/backtest controls, config persistence)
- Backend: FastAPI with StatsForecast, MLForecast, NeuralForecast
- Data contract: single time-series with \`ds\` (timestamp) and \`y\` (numeric)

## Quickstart
1. Backend: \`cd backend && python -m venv .venv && ./.venv/Scripts/activate && pip install -r requirements.txt\`
2. Copy env: \`cp .env.example .env\`, then run \`uvicorn app.main:app --reload --port 9000\`
3. Frontend: \`cd frontend && npm install && npm run dev\` (expects API at http://localhost:9000 or set \`VITE_API_BASE_URL\`)

## Features
- Model breadth: StatsForecast (AutoARIMA/AutoETS/Naive/etc.), MLForecast (LightGBM/XGBoost/CatBoost/RandomForest/Linear), NeuralForecast (MLP/RNN/LSTM/GRU)
- Benchmarking: batch endpoint runs multiple configs and returns a leaderboard
- Rolling backtests: configurable windows/step with aggregate metrics per model
- Preprocessing: date filters, missing-value strategies, log transform, holdout splits
- Frequency handling: automatic cadence detection with manual override
- Config persistence: save/reload named configurations on disk
- Sample data: bundled series with recommended settings

## Key Endpoints
- POST /upload: stream CSV upload, validate/remap columns, return preview + detected frequency
- POST /forecast: single-model forecast with metrics/intervals and optional fitted values
- POST /forecast/batch: run multiple configs on the same dataset; returns forecasts + leaderboard
- POST /backtest: rolling windows backtest across configs; per-window + aggregate metrics
- GET/POST /configs: list/save reusable configurations
- GET /datasets, GET /datasets/{id}: sample metadata and full records

## Testing and Quality
- Backend: pytest, ruff, black, isort
- Frontend: npm run test (Vitest), npm run lint (ESLint + Prettier)

> Fast path: drop a CSV, map ds/y, toggle preset model sets, run forecast or benchmark, and read the chart + leaderboard side by side.
`;

const notesCatalog = [
  {
    title: "DeepCast README",
    summary: "Stack, quickstart, features, and endpoints for the forecasting lab.",
    slug: "deepcast-readme",
  },
];

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-3xl leading-snug">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-10 text-2xl">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-8 text-xl">{children}</h3>,
  p: ({ children }) => <p className="mt-4 text-[var(--kaito-muted)]">{children}</p>,
  ul: ({ children }) => <ul className="mt-4 list-disc space-y-3 pl-5 text-[var(--kaito-muted)]">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 list-decimal space-y-3 pl-5 text-[var(--kaito-muted)]">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mt-6 border-l-2 border-[var(--kaito-border)] bg-[var(--kaito-subtle)] px-4 py-3 text-[var(--kaito-ink)]">
      {children}
    </blockquote>
  ),
};

export const Notes = () => {
  const [activeNote, setActiveNote] = useState<string | null>(null);

  return (
    <PageWrapper className="space-y-10 pb-10">
      <motion.section variants={itemVariants} className="rounded-[22px] border border-[var(--kaito-border)] bg-[var(--kaito-surface)] p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--kaito-muted)]">Readme</p>
        <h1 className="text-4xl leading-tight">DeepCast overview and setup notes.</h1>
        <p className="mt-3 max-w-2xl text-[var(--kaito-muted)]">
          Everything you need to get the forecasting lab running locally: stack summary, setup, endpoints, and how to validate changes.
        </p>
      </motion.section>

      <motion.section variants={itemVariants} className="grid gap-4 md:grid-cols-3">
        {notesCatalog.map((note) => (
          <button
            key={note.slug}
            onClick={() => setActiveNote(note.slug)}
            className={[
              "text-left rounded-[18px] border border-[var(--kaito-border)] bg-[var(--kaito-surface)] p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg",
              activeNote === note.slug ? "ring-2 ring-[var(--kaito-ink)] ring-offset-2 ring-offset-[var(--kaito-surface)]" : "",
            ].join(" ")}
          >
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--kaito-muted)]">Note</p>
            <h3 className="mt-2 text-xl text-[var(--kaito-ink)]">{note.title}</h3>
            <p className="mt-2 text-[var(--kaito-muted)]">{note.summary}</p>
          </button>
        ))}
      </motion.section>

      {activeNote ? (
        <motion.section
          variants={itemVariants}
          className="overflow-hidden rounded-[22px] border border-[var(--kaito-border)] bg-[var(--kaito-surface)] shadow-sm"
        >
          <div className="bg-[var(--kaito-subtle)] px-6 py-3 text-xs uppercase tracking-[0.24em] text-[var(--kaito-muted)]">
            {activeNote === "deepcast-readme" ? "DeepCast README" : "Note"}
          </div>
          <motion.article variants={itemVariants} className="px-6 py-8 leading-relaxed">
            {activeNote === "deepcast-readme" ? (
              <ReactMarkdown components={markdownComponents}>{noteMarkdown}</ReactMarkdown>
            ) : null}
          </motion.article>
        </motion.section>
      ) : (
        <motion.section
          variants={itemVariants}
          className="flex items-center justify-center rounded-[22px] border border-[var(--kaito-border)] bg-[var(--kaito-surface)] p-8 text-sm text-[var(--kaito-muted)] shadow-sm"
        >
          Select a note to view its details.
        </motion.section>
      )}
    </PageWrapper>
  );
};

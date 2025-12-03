import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { motion } from "framer-motion";

import { PageWrapper, itemVariants } from "../components/PageWrapper";

const noteMarkdown = String.raw`
# Deep Forecasting Web App

React + FastAPI lab: upload a CSV, map \`ds\`/\`y\`, and run StatsForecast, MLForecast, or NeuralForecast models with benchmarks, rolling backtests, and confidence bands.

## Stack
- Frontend: Vite + React + Tailwind (Dashboard, ConfigPanel, charts/tables, presets, saved configs)
- Backend: FastAPI with StatsForecast, MLForecast, NeuralForecast (Nixtla stack)
- Data contract: single time-series with \`ds\` (timestamp) and \`y\` (numeric)

## Project Map
\`\`\`
DeepForecasting_Webapp
|-- backend/          FastAPI + Nixtla stack
|   |-- app/
|   |   |-- main.py               # API wiring, routes, CORS
|   |   |-- models.py             # model registry and schemas
|   |   |-- sample_data.py        # bundled datasets metadata
|   |   |-- services/             # forecasting + backtesting helpers
|   |   \`-- utils/                # shared parsing/validation
|   \`-- tests/                    # pytest suites
|
|-- frontend/         Vite + React + Tailwind UI
|   |-- src/
|   |   |-- components/           # config panel, charts, upload, tables
|   |   |-- hooks/                # data fetching and state helpers
|   |   |-- pages/                # dashboard shell
|   |   |-- ForecastDashboard.tsx # main experience
|   |   \`-- index.css             # theme tokens + globals
|   \`-- public/
|
\`-- README.md
\`\`\`

## Quickstart
1. Backend: \`cd backend && python -m venv .venv && ./.venv/Scripts/activate && pip install -r requirements.txt\`
2. Copy env: \`cp .env.example .env\`, then run \`uvicorn app.main:app --reload --port 9000\`
3. Frontend: \`cd frontend && npm install && npm run dev\` (expects API at http://localhost:9000 or set \`VITE_API_BASE_URL\`)

## Features
- Model breadth: StatsForecast (AutoARIMA/AutoETS/naive), MLForecast (LightGBM/XGBoost/CatBoost/RandomForest/Linear), NeuralForecast (MLP/RNN/LSTM/GRU)
- Benchmarking: \`/forecast/batch\` runs multiple configs and returns a leaderboard
- Rolling backtests: \`/backtest\` with window/step controls and per-window + aggregate metrics
- Preprocessing: date filters, missing-value strategies, log transform, holdout splits, cadence detection/override
- Config persistence: save/reload named configurations; bundled sample datasets with suggested defaults

## Walkthrough
### Architecture
- FastAPI backend (\`backend/app/main.py\`) with service layer (\`backend/app/services/forecaster.py\`) and Pydantic schemas (\`backend/app/models.py\`).
- React/Vite frontend; main experience in \`frontend/src/ForecastDashboard.tsx\`, state/data in \`frontend/src/hooks/useForecast.ts\`, UI controls/charts in \`frontend/src/components/*\`.

### Backend flow
- \`/upload\` validates/cleans CSVs (\`validate_timeseries_payload\`), infers frequency, stores df keyed by \`upload_id\`.
- \`/forecast\` single run; \`/forecast/batch\` benchmarks multiple configs; \`/backtest\` rolling windows; \`/configs\` save/retrieve; \`/datasets\` serves bundled samples.
- \`NixtlaService\` prepares data (sorts, date filters, missing strategy, optional log1p), optional freq detect, holdout sizing from \`test_size_fraction\` or horizon.
- Strategies: \`one_step\` retrains each step; \`multi_step_recursive\` uses one model for full horizon; \`multi_output_direct\` only for ML/Neural.
- Models: StatsForecast (ARIMA/ETS/naive/window averages), MLForecast (linear/tree/boosting with lags), NeuralForecast (MLP/RNN/LSTM/GRU with ray stub fallback). Defaults favor quick, safe runs (season_length-driven ARIMA/ETS, lags [1,7,season], small neural sizes).
- Outputs: timestamps + forecasts + optional confidence intervals; metrics MAE/RMSE/MAPE. Leaderboards rank by RMSE then MAE.

### Evaluation & backtesting
- Holdout split: fraction of rows (capped to leave >=1 train point) or \`min(horizon, n-1)\`; metrics align lengths; MAPE skips zero actuals.
- Backtests: rolling windows from the tail, training on past rows and testing the next horizon; advance by \`step_size\`; averages metrics across windows.
- One-step mirrors iterative real-time: re-include each actual before predicting the next step.

### Frontend flow
- \`useForecast.ts\` holds config, upload/sample data, run history, benchmarks, backtests, saved configs, and API calls; sanitizes configs to keep module/model/strategy valid.
- \`ConfigPanel.tsx\`: module/model pickers, horizon/freq/season length, test split slider, missing strategy, date filters, strategy toggle, log transform, confidence levels (StatsForecast), lags (MLForecast), neural hyperparams.
- \`FileUpload.tsx\`: reads CSV headers, guesses \`ds\`/\`y\`, maps to \`/upload\`, shows preview; \`SampleDatasetPicker.tsx\` pulls \`/datasets\` and applies recommended defaults.
- \`ForecastDashboard.tsx\`: KPIs, chart, table, benchmark/backtest controls, leaderboard tabs, CSV export; \`useRunForecast\` wraps runs with toasts; theme/tokens in \`src/index.css\`.

### Typical user workflow
- Upload CSV or pick a sample -> backend validates + infers freq -> UI sets preview/history and suggested config.
- Adjust config (module/model, horizon, freq/seasonality, missing handling, test split, log transform, strategy, hyperparams).
- Run a single forecast (metrics + bounds + fitted optional) and optionally export CSV.
- Benchmark multiple presets via \`/forecast/batch\`; get ranked leaderboard.
- Run rolling backtests to view window-by-window and aggregate metrics.
- Save/load configs via \`/configs\` to reuse setups.

## Key Endpoints
- \`POST /upload\`: stream CSV upload, validate/remap columns, return preview + detected frequency
- \`POST /forecast\`: single-model forecast with metrics/intervals and optional fitted values
- \`POST /forecast/batch\`: run multiple configs on the same dataset; returns forecasts + leaderboard
- \`POST /backtest\`: rolling windows backtest across configs; per-window + aggregate metrics
- \`GET/POST /configs\`: list/save reusable configurations
- \`GET /datasets\`, \`GET /datasets/{id}\`: sample metadata and full records

## Testing and Quality
- Backend: \`pytest\`, \`ruff\`, \`black\`, \`isort\`
- Frontend: \`npm run test\` (Vitest), \`npm run lint\` (ESLint + Prettier)
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

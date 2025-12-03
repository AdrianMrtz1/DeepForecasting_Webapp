# Deep Forecasting Web App

[![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61dafb?logo=react&logoColor=20232a)](frontend/)
[![Backend](https://img.shields.io/badge/backend-FastAPI-009485?logo=fastapi&logoColor=white)](backend/)
[![Models](https://img.shields.io/badge/models-StatsForecast%20%7C%20MLForecast%20%7C%20NeuralForecast-9333ea)](#features)
[![Quality](https://img.shields.io/badge/tests-pytest%20%7C%20vitest-0ea5e9)](#testing)

Forecast lab built with React and FastAPI: upload a CSV, map your `ds` and `y` columns, and run StatsForecast, MLForecast, or NeuralForecast models with side-by-side benchmarks, rolling backtests, and confidence bands.

## Project Map
Copy-paste friendly visual of the layout:
```
DeepForecasting_Webapp
|-- backend/          FastAPI + Nixtla stack
|   |-- app/
|   |   |-- main.py               # API wiring, routes, CORS
|   |   |-- models.py             # model registry and schemas
|   |   |-- sample_data.py        # bundled datasets metadata
|   |   |-- services/             # forecasting + backtesting helpers
|   |   `-- utils/                # shared parsing/validation
|   `-- tests/                    # pytest suites
|
|-- frontend/         Vite + React + Tailwind UI
|   |-- src/
|   |   |-- components/           # config panel, charts, upload, tables
|   |   |-- hooks/                # data fetching and state helpers
|   |   |-- pages/                # dashboard shell
|   |   |-- ForecastDashboard.tsx # main experience
|   |   `-- index.css             # theme tokens + globals
|   `-- public/
|
`-- README.md
```

## Features
- Model breadth: StatsForecast (AutoARIMA/AutoETS/naive), MLForecast (LightGBM/XGBoost/CatBoost/RandomForest/Linear), NeuralForecast (MLP/RNN/LSTM/GRU).
- Benchmarking: `/forecast/batch` runs multiple configs at once and returns a leaderboard.
- Rolling backtests: `/backtest` performs multi-window evaluations with per-window and aggregate metrics.
- Preprocessing: date filters, missing-value handling (drop/ffill/bfill/interpolate), optional log transform, holdout splits, cadence detection with overrides.
- Config persistence: `/configs` endpoints store named setups on disk; `/datasets` serves built-in samples with recommended defaults.

## Walkthrough
Architecture
- FastAPI backend (`backend/app/main.py`) with Nixtla-centric service layer (`backend/app/services/forecaster.py`) and Pydantic schemas (`backend/app/models.py`).
- React/Vite frontend with Tailwind styling. Main experience in `frontend/src/ForecastDashboard.tsx`, data/state in `frontend/src/hooks/useForecast.ts`, UI controls/charts in `frontend/src/components/*`.

Backend flow
- `/upload` ingests CSV, validates/cleans (`validate_timeseries_payload`), infers frequency, stores df in-memory keyed by `upload_id`.
- `/forecast` runs a single config; `/forecast/batch` benchmarks multiple configs; `/backtest` does rolling windows; `/configs` persist/retrieve saved setups; `/datasets` serves bundled samples (`backend/app/sample_data.py`).
- `NixtlaService` prepares data (sorts, date filters, missing-value strategy, optional log1p), detects frequency when allowed, and picks holdout size from `test_size_fraction` or horizon.
- Strategies: `one_step` retrains each step with actuals; `multi_step_recursive` uses one model for full horizon; `multi_output_direct` only for ML/Neural modules.
- Models: StatsForecast (ARIMA/ETS/naive/window averages), MLForecast (linear/tree/boosting with lags), NeuralForecast (MLP/RNN/LSTM/GRU with minimal ray stub).
- Defaults aim for quick, safe runs (season_length-driven ARIMA/ETS, ML lags `[1, 7, season]`, small neural layers/hidden sizes, epochs optional).
- Outputs: timestamps + forecasts + optional confidence intervals; metrics include MAE/RMSE/MAPE on holdout/backtest slices. Leaderboards rank primarily by RMSE.

Evaluation & backtesting
- Holdout split: fraction of rows (capped to leave >=1 train point) or defaults to `min(horizon, n-1)`. Metrics align lengths; MAPE skips zero actuals.
- Backtests: rolling windows from the tail; each window trains on earlier rows and tests the next horizon, advancing by `step_size`. Aggregates average metrics across windows.
- One-step option mimics iterative real-time evaluation by re-including each actual before predicting the next step.

Frontend flow
- `useForecast.ts` holds config, upload/sample data, run history, benchmarks, backtests, saved configs, and API calls. Sanitizes configs to keep module/model/strategy valid and fills module-specific defaults.
- `ConfigPanel.tsx` is the control surface: module/model pickers, horizon/freq/season length, test split slider, missing strategy, date filters, strategy toggle, log transform, confidence levels (StatsForecast), lags (MLForecast), and neural hyperparams.
- `FileUpload.tsx` reads CSV headers, guesses `ds`/`y`, lets you map them, posts to `/upload`, and shows preview rows; `SampleDatasetPicker.tsx` pulls `/datasets` and applies recommended defaults per sample.
- `ForecastDashboard.tsx` orchestrates: KPI cards, chart (`ForecastChart.tsx`), data table (`ForecastDataTable.tsx`), benchmark/backtest controls, leaderboard tabs, and run/export actions. `useRunForecast` wraps runs with toast feedback. Theme/tokens in `frontend/src/index.css`; layout components (`Layout.tsx`, `PageWrapper.tsx`) frame the shell.

Typical user workflow
- Upload CSV or pick a sample dataset -> backend validates and infers freq -> UI sets preview/history and suggested config.
- Adjust config in the panel (module/model, horizon, freq/seasonality, missing handling, test split, log transform, strategy, module-specific hyperparams).
- Run a single forecast (metrics + bounds + fitted optional); optionally export CSV.
- Benchmark multiple presets (e.g., AutoARIMA, AutoETS, LightGBM, GRU) via `/forecast/batch` to get a ranked leaderboard.
- Run rolling backtests to see window-by-window and aggregate metrics over time.
- Save/load configs via `/configs` to reuse setups.

## Getting Started
### Backend
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate          # on Windows
pip install -r requirements.txt
# Python 3.13: install neuralforecast manually -> pip install --no-deps neuralforecast==3.1.2
cp .env.example .env
uvicorn app.main:app --reload --port 9000
```
Docs at `http://localhost:9000/docs`, health at `/health`.

### Frontend
```bash
cd frontend
npm install
npm run dev   # serves http://localhost:5173 (expects API at http://localhost:9000)
```
Optional: set `VITE_API_BASE_URL` to point to a different backend.

## API Highlights
- `POST /upload`: stream CSV upload, validate/remap columns, return preview + detected frequency.
- `POST /forecast`: single-model forecast with metrics/intervals and optional fitted values.
- `POST /forecast/batch`: run multiple configs on the same dataset; returns forecasts + leaderboard.
- `POST /backtest`: rolling windows backtest across configs; returns per-window + aggregate metrics.
- `GET /configs` / `POST /configs`: list/save reusable configurations.
- `GET /datasets`, `GET /datasets/{id}`: sample metadata and full records.

## Testing
- Backend: `pytest`, `ruff check .`, `black .`, `isort .` (see `backend/pyproject.toml`).
- Frontend: `npm run test` (Vitest), `npm run lint` (ESLint + Prettier).

## Deployment Notes
- Backend: `uvicorn app.main:app --host 0.0.0.0 --port 9000`.
- Frontend: `npm run build` outputs to `frontend/dist/`; serve statically and set `VITE_API_BASE_URL` to your API.

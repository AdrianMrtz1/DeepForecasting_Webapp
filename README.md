# Deep Forecasting Web App (Track 2)

React + FastAPI implementation of the Track 2 Nixtla project: upload a CSV, pick target/date columns, run econometric/ML/neural models, benchmark them with rolling backtests, and compare results in a single UI.

## Stack
- **Frontend:** Vite + React + Tailwind (lab-style layout, benchmark/backtest controls, config persistence)
- **Backend:** FastAPI with StatsForecast, MLForecast, NeuralForecast
- **Data contract:** single time-series with `ds` (timestamp) and `y` (numeric)

## Quickstart
1) **Backend**
   ```bash
   cd backend
   python -m venv .venv
   .\.venv\Scripts\activate          # on Windows
   pip install -r requirements.txt
   # Python 3.13: install neuralforecast manually -> pip install --no-deps neuralforecast==3.1.2
   cp .env.example .env
   uvicorn app.main:app --reload --port 8000
   ```
   Docs: `http://localhost:8000/docs`, health: `/health`

2) **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev   # http://localhost:5173 (expects API at http://localhost:8000)
   ```
   Optional: set `VITE_API_BASE_URL` to point to a different backend.

## Features (Track 2 coverage)
- **Model breadth:** StatsForecast (AutoARIMA/AutoETS/Naive/etc.), MLForecast (LightGBM/XGBoost/CatBoost/RandomForest/Linear), NeuralForecast (MLP/RNN/LSTM/GRU)
- **Benchmarking:** `/forecast/batch` runs multiple configs at once and returns a leaderboard.
- **Rolling backtests:** `/backtest` performs multi-window evaluations (configurable windows/step) with aggregate metrics per model.
- **Preprocessing:** date-range filters, missing-value strategies (drop/ffill/bfill/interpolate), optional log transform, holdout splits.
- **Frequency handling:** automatic cadence detection on upload with override controls.
- **Config persistence:** `/configs` endpoints to save/reload named configurations (stored on disk).
- **Sample data:** `/datasets` + `/datasets/{id}` provide bundled series with recommended settings.

## Key Endpoints
- `POST /upload` — stream CSV upload, validate/remap columns, return preview + detected frequency.
- `POST /forecast` — single-model forecast with metrics/intervals and optional fitted values.
- `POST /forecast/batch` — run multiple configs on the same dataset; returns forecasts + leaderboard.
- `POST /backtest` — rolling windows backtest across configs; returns per-window + aggregate metrics.
- `GET /configs` / `POST /configs` — list/save reusable configurations.
- `GET /datasets`, `GET /datasets/{id}` — sample metadata and full records.

## Frontend UX Notes
- Sidebar status + theme toggle; central ribbon for upload, sample picker, configuration (module/model/strategy/frequency/test split/log transform, missing handling, date filters).
- Benchmark/backtest panel with predefined model set toggles, window controls, saved configs, and leaderboards.
- Forecast chart with confidence bands, fitted values, and test-set overlay; tables for horizon details and run history.

## Testing & Quality
- Backend: `pytest`, `ruff check .`, `black .`, `isort .` (see `backend/pyproject.toml`).
- Frontend: `npm run test` (Vitest), `npm run lint` (ESLint + Prettier).

## Deployment Tips
- Backend: run `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- Frontend: `npm run build` outputs to `frontend/dist/`; serve via any static host and set `VITE_API_BASE_URL` accordingly.

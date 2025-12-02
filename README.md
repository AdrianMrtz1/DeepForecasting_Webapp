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

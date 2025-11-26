import type { ModuleType } from "../types";

export const STATSFORECAST_MODELS = [
  "arima",
  "auto_arima",
  "auto_ets",
  "naive",
  "seasonal_naive",
  "random_walk_with_drift",
  "window_average",
  "seasonal_window_average",
] as const;

export const MLFORECAST_MODELS = [
  "xgboost",
  "lightgbm",
  "random_forest",
  "catboost",
  "linear",
] as const;

export const NEURALFORECAST_MODELS = ["mlp", "rnn", "lstm", "gru"] as const;

export const MODEL_OPTIONS: Record<ModuleType, readonly string[]> = {
  StatsForecast: STATSFORECAST_MODELS,
  MLForecast: MLFORECAST_MODELS,
  NeuralForecast: NEURALFORECAST_MODELS,
};

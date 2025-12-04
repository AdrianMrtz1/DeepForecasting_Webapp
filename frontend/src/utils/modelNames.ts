export const cleanModelName = (modelStr: string) => {
  const normalized = modelStr.toLowerCase();
  const map: Record<string, string> = {
    auto_arima: "AutoARIMA",
    auto_ets: "AutoETS",
    lightgbm: "LightGBM",
    xgboost: "XGBoost",
    random_walk_with_drift: "RandomWalkWithDrift",
    seasonal_naive: "SeasonalNaive",
    seasonal_window_average: "SeasonalWindowAverage",
    window_average: "WindowAverage",
    random_forest: "RandomForest",
    catboost: "CatBoost",
    gru: "GRU",
    lstm: "LSTM",
    rnn: "RNN",
    mlp: "MLP",
    naive: "Naive",
    linear: "Linear",
    arima: "ARIMA",
  };
  if (map[normalized]) return map[normalized];

  return normalized
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
};

export const formatModelName = (module: string, model: string) => {
  const base = cleanModelName(model);
  const baseOnlyModules = new Set(["StatsForecast", "MLForecast", "NeuralForecast"]);
  if (baseOnlyModules.has(module)) return base;
  return `${module} ${base}`;
};

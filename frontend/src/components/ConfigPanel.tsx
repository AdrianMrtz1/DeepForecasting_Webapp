import { useMemo, useState } from "react";

import { ChevronDown, Loader2, Play, Settings2, SlidersHorizontal } from "lucide-react";

import { MODEL_OPTIONS } from "../constants/models";
import type { ForecastConfigState, ModuleType, Strategy } from "../types";

const freqOptions = ["H", "D", "W", "MS", "M", "QS", "Q", "YS", "Y"];

const moduleOptions: { value: ModuleType; label: string; helper: string; disabled?: boolean }[] = [
  {
    value: "StatsForecast",
    label: "StatsForecast",
    helper: "Classical baselines (ARIMA/ETS/naive).",
  },
  { value: "MLForecast", label: "MLForecast", helper: "Lag-based tree/linear regressors." },
  {
    value: "NeuralForecast",
    label: "NeuralForecast",
    helper: "Feed-forward and recurrent neural nets.",
  },
];

const formatModelLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const modelOptionsByModule: Record<
  ModuleType,
  { value: string; label: string; disabled?: boolean }[]
> = {
  StatsForecast: MODEL_OPTIONS.StatsForecast.map((value) => ({
    value,
    label: formatModelLabel(value),
  })),
  MLForecast: MODEL_OPTIONS.MLForecast.map((value) => ({ value, label: formatModelLabel(value) })),
  NeuralForecast: MODEL_OPTIONS.NeuralForecast.map((value) => ({
    value,
    label: formatModelLabel(value),
  })),
};

const strategyLabels: Record<Strategy, string> = {
  one_step: "One step",
  multi_step_recursive: "Recursive",
  multi_output_direct: "Direct (multi-output)",
};

const confidenceOptions = [50, 75, 80, 90, 95];

interface ConfigPanelProps {
  config: ForecastConfigState;
  onChange: (patch: Partial<ForecastConfigState>) => void;
  disabled?: boolean;
  onRun?: () => void;
  running?: boolean;
  dataReady?: boolean;
  detectedFreq?: string | null;
}

export const ConfigPanel = ({
  config,
  onChange,
  disabled = false,
  onRun,
  running = false,
  dataReady = false,
  detectedFreq = null,
}: ConfigPanelProps) => {
  const [open, setOpen] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const models = useMemo(
    () => modelOptionsByModule[config.module_type] ?? [],
    [config.module_type],
  );
  const testSizePercent = Math.round((config.test_size_fraction ?? 0) * 100);
  const directSupported = config.module_type !== "StatsForecast";
  const showNeuralHyperparams = config.module_type === "NeuralForecast";
  const showMlHyperparams = config.module_type === "MLForecast";
  const showConfidenceControls = config.module_type === "StatsForecast";
  const lagInputValue = (config.lags ?? []).join(", ");

  const normalizePositive = (value: string) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : undefined;
  };

  const toggleLevel = (level: number) => {
    const exists = config.level.includes(level);
    const next = exists ? config.level.filter((lvl) => lvl !== level) : [...config.level, level];
    onChange({ level: next });
  };

  const handleTestSizeChange = (value: number) => {
    if (value < 0) {
      onChange({ test_size_fraction: null });
      return;
    }
    onChange({ test_size_fraction: value / 100 });
  };

  const handleLagChange = (value: string) => {
    const parsed = value
      .split(/[,\s]+/)
      .map((part) => Number(part))
      .filter((num) => Number.isFinite(num) && num > 0);
    const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
    onChange({ lags: unique });
  };

  const canRun = Boolean(onRun) && dataReady && !disabled && !running;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-4 text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <p className="card-title">Configuration</p>
            <h3 className="text-lg font-semibold leading-tight">Forecast setup</h3>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-400/60"
          aria-expanded={open}
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      {open ? (
        <div className="space-y-5 p-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Module
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {moduleOptions.map((opt) => {
                const active = config.module_type === opt.value;
                const inputId = `module-${opt.value}`;
                return (
                  <label
                    key={opt.value}
                    htmlFor={inputId}
                    aria-label={opt.label}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition duration-150 ${
                      active
                        ? "border-indigo-300 bg-indigo-50 shadow-sm shadow-indigo-500/10 dark:border-indigo-500/50 dark:bg-indigo-500/10"
                        : "border-slate-200 bg-white hover:-translate-y-[1px] hover:border-indigo-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-indigo-400/50"
                    } ${opt.disabled ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <input
                      id={inputId}
                      type="radio"
                      name="module"
                      value={opt.value}
                      disabled={opt.disabled || disabled}
                      checked={active}
                      onChange={() => onChange({ module_type: opt.value })}
                      className="mt-1 accent-indigo-500"
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
                        {opt.label}
                      </p>
                      <p className="break-words text-xs leading-snug text-slate-600 dark:text-slate-300">
                        {opt.helper}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="panel-subtle p-3">
              <label
                className="flex items-center justify-between text-sm text-slate-800 dark:text-slate-100"
                htmlFor="model-select"
              >
                <span className="font-semibold">Model</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  changes per module
                </span>
              </label>
              <select
                id="model-select"
                className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={config.model_type}
                onChange={(e) => onChange({ model_type: e.target.value })}
                disabled={disabled}
              >
                {models.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label} {opt.disabled ? "(soon)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Showing models for {config.module_type}. Switch the module cards above to reveal
                neural or ML options.
              </p>
            </div>

            <div className="panel-subtle p-3">
              <label
                className="text-sm font-semibold text-slate-800 dark:text-slate-100"
                htmlFor="horizon-input"
              >
                Horizon
              </label>
              <input
                id="horizon-input"
                type="number"
                min={1}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={config.horizon}
                onChange={(e) => onChange({ horizon: Number(e.target.value) })}
                disabled={disabled}
              />
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Forecast steps ahead.
              </p>
            </div>

            <div className="panel-subtle p-3">
              <label
                className="text-sm font-semibold text-slate-800 dark:text-slate-100"
                htmlFor="freq-select"
              >
                Frequency
              </label>
              <select
                id="freq-select"
                className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={config.freq}
                onChange={(e) => onChange({ freq: e.target.value })}
                disabled={disabled}
              >
                {freqOptions.map((freq) => (
                  <option key={freq} value={freq}>
                    {freq}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {detectedFreq
                  ? "Detected " + detectedFreq + " from the sample; override if it looks off."
                  : "Pandas alias; choose the cadence or override auto-detection."}
              </p>
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  className="accent-indigo-500"
                  checked={config.detect_frequency !== false}
                  onChange={(e) => onChange({ detect_frequency: e.target.checked })}
                  disabled={disabled}
                />
                <span>Auto-detect frequency from timestamps</span>
              </label>
            </div>

            <div className="panel-subtle p-3">
              <label
                className="flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100"
                htmlFor="test-size-range"
              >
                <span>Test set size (%)</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">holdout %</span>
              </label>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Reserve the tail of the series to validate metrics before you forecast.
              </p>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id="test-size-range"
                  type="range"
                  min={0}
                  max={60}
                  step={5}
                  value={testSizePercent}
                  disabled={disabled}
                  onChange={(e) => handleTestSizeChange(Number(e.target.value))}
                  className="flex-1 accent-indigo-500"
                />
                <span className="w-14 text-right text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {testSizePercent}%
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>
                  {testSizePercent
                    ? "Holding out part of the series"
                    : "No test split (uses full history)"}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleTestSizeChange(20)}
                  className="text-indigo-600 underline-offset-2 transition hover:text-indigo-500 dark:text-indigo-400"
                >
                  Reset 20%
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="panel-subtle p-3">
              <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Missing values
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={config.missing_strategy ?? "none"}
                onChange={(e) => onChange({ missing_strategy: e.target.value as any })}
                disabled={disabled}
              >
                <option value="none">Leave as-is</option>
                <option value="drop">Drop missing</option>
                <option value="ffill">Forward fill</option>
                <option value="bfill">Backward fill</option>
                <option value="interpolate">Interpolate</option>
              </select>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Preprocess the series before training/backtesting.
              </p>
            </div>

            <div className="panel-subtle p-3">
              <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Date range (optional)
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Start (YYYY-MM-DD)"
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  value={config.date_start ?? ""}
                  onChange={(e) => onChange({ date_start: e.target.value || null })}
                  disabled={disabled}
                />
                <input
                  type="text"
                  placeholder="End (YYYY-MM-DD)"
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  value={config.date_end ?? ""}
                  onChange={(e) => onChange({ date_end: e.target.value || null })}
                  disabled={disabled}
                />
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Limit training/backtesting to a specific time window.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-100/80 px-4 py-3 text-xs text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-indigo-500" />
              <span>Advanced settings: strategy, seasonality, confidence, hyperparameters</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="rounded-full border border-indigo-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-indigo-500/60 dark:text-indigo-200"
            >
              {showAdvanced ? "Hide" : "Show"}
            </button>
          </div>

          {showAdvanced ? (
            <div className="space-y-4">
              <div className="panel-subtle p-3">
                <div className="flex items-center justify-between text-sm text-slate-800 dark:text-slate-100">
                  <span className="font-semibold">Strategy</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    one vs recursive
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {(["one_step", "multi_step_recursive", "multi_output_direct"] as Strategy[]).map(
                    (strategy) => (
                      <label
                        key={strategy}
                        className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100"
                      >
                        <input
                          type="radio"
                          className="accent-indigo-500"
                          name="strategy"
                          checked={config.strategy === strategy}
                          disabled={
                            disabled || (strategy === "multi_output_direct" && !directSupported)
                          }
                          onChange={() => onChange({ strategy })}
                        />
                        <span
                          className={
                            strategy === "multi_output_direct" && !directSupported
                              ? "text-slate-400"
                              : ""
                          }
                        >
                          {strategyLabels[strategy]}
                          {strategy === "multi_output_direct" && !directSupported
                            ? " (StatsForecast not supported)"
                            : ""}
                        </span>
                      </label>
                    ),
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  {directSupported
                    ? "Direct trains separate steps at once (best for ML/Neural); recursive reuses a single model."
                    : "Direct/multi-output isn't available for StatsForecast. Switch to MLForecast or NeuralForecast to enable it."}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="panel-subtle p-3">
                  <label
                    className="text-sm font-semibold text-slate-800 dark:text-slate-100"
                    htmlFor="season-length-input"
                  >
                    Season length
                  </label>
                  <input
                    id="season-length-input"
                    type="number"
                    min={1}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    value={config.season_length}
                    onChange={(e) => onChange({ season_length: Number(e.target.value) })}
                    disabled={disabled}
                  />
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Periods per season.
                  </p>
                </div>

                <div className="panel-subtle p-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <span>Log transform</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      stabilize variance
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Applies log1p before training and inverts the forecast.
                  </p>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ log_transform: !config.log_transform })}
                    className={`mt-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      config.log_transform
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500/60 dark:bg-indigo-500/10 dark:text-indigo-100"
                        : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    }`}
                  >
                    <span>{config.log_transform ? "Log transform on" : "Disabled"}</span>
                    <span
                      className={`inline-flex h-5 w-10 items-center rounded-full px-1 transition ${
                        config.log_transform ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    >
                      <span
                        className={`h-3.5 w-3.5 rounded-full bg-white shadow transition ${
                          config.log_transform ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </span>
                  </button>
                </div>
              </div>

              {showConfidenceControls && (
                <div className="panel-subtle p-3">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Confidence levels
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {confidenceOptions.map((lvl) => {
                      const active = config.level.includes(lvl);
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => toggleLevel(lvl)}
                          disabled={disabled}
                          className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                            active
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500/60 dark:bg-indigo-500/10 dark:text-indigo-100"
                              : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                          }`}
                        >
                          {lvl}%
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Confidence bands are available for StatsForecast runs.
                  </p>
                </div>
              )}

              {showMlHyperparams && (
                <div className="panel-subtle p-3">
                  <label
                    className="flex items-center justify-between text-sm text-slate-800 dark:text-slate-100"
                    htmlFor="lag-input"
                  >
                    <span className="font-semibold">Lag features</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      comma separated
                    </span>
                  </label>
                  <input
                    id="lag-input"
                    type="text"
                    inputMode="numeric"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    value={lagInputValue}
                    onChange={(e) => handleLagChange(e.target.value)}
                    placeholder="1, 12 (for lag-1 and lag-12)"
                    disabled={disabled}
                  />
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Choose the lag features the ML models will use (e.g., 1, 7, 14). Leave blank to
                    fall back to defaults.
                  </p>
                </div>
              )}

              {showNeuralHyperparams && (
                <div className="panel-subtle p-3">
                  <div className="flex items-center justify-between text-sm text-slate-800 dark:text-slate-100">
                    <span className="font-semibold">Neural architecture</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      applies to MLP/RNN/LSTM/GRU
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label
                        className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                        htmlFor="hidden-layers-select"
                      >
                        Hidden layers
                      </label>
                      <select
                        id="hidden-layers-select"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        value={config.num_layers ?? 2}
                        onChange={(e) => onChange({ num_layers: Number(e.target.value) })}
                        disabled={disabled}
                      >
                        {[1, 2].map((val) => (
                          <option key={val} value={val}>
                            {val} layer{val > 1 ? "s" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                        htmlFor="hidden-size-input"
                      >
                        Nodes (hidden size)
                      </label>
                      <input
                        id="hidden-size-input"
                        type="number"
                        min={1}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        value={config.hidden_size ?? ""}
                        onChange={(e) =>
                          onChange({ hidden_size: normalizePositive(e.target.value) })
                        }
                        placeholder="e.g. 128"
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <label
                        className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                        htmlFor="epochs-input"
                      >
                        Epochs
                      </label>
                      <input
                        id="epochs-input"
                        type="number"
                        min={1}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        value={config.epochs ?? ""}
                        onChange={(e) => onChange({ epochs: normalizePositive(e.target.value) })}
                        placeholder="e.g. 400"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    Keep these minimal (1-2 layers) to balance speed and accuracy. Defaults use 2
                    layers, 128 nodes, 400 epochs.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-800 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Run forecast</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {dataReady
                    ? "Data is loaded. Apply your settings, then run."
                    : "Load a sample or upload to enable the run button."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => (onRun ? onRun() : undefined)}
                disabled={!canRun}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {running ? "Training..." : "Run forecast"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
          Collapsed for breathing room. Expand to fine-tune your configuration.
        </div>
      )}
    </div>
  );
};

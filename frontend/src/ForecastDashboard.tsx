import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import {
  Activity,
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Download,
  Info,
  Loader2,
} from "lucide-react";

import { ConfigPanel } from "./components/ConfigPanel";
import { FileUpload } from "./components/FileUpload";
import { ForecastChart } from "./components/ForecastChart";
import { ForecastDataTable } from "./components/ForecastDataTable";
import { PageWrapper, itemVariants } from "./components/PageWrapper";
import { SampleDatasetPicker } from "./components/SampleDatasetPicker";
import { TopKpiRow } from "./components/TopKpiRow";
import { useForecast } from "./hooks/useForecast";
import { useRunForecast } from "./hooks/useRunForecast";
import type { ForecastConfigState } from "./types";



const buildDownloadCsv = (

  config: ForecastConfigState,

  rows: ReturnType<typeof mapForecastRows>,

) => {

  const header = [

    "timestamp",

    "forecast",

    ...rows.intervals.map((lvl) => `lower_${lvl}`),

    ...rows.intervals.map((lvl) => `upper_${lvl}`),

  ];

  const lines = [header.join(",")];

  rows.data.forEach((row) => {

    const parts = [row.timestamp, row.forecast.toString()];

    rows.intervals.forEach((lvl) => parts.push(row.bounds?.[lvl]?.lower?.toString() ?? ""));

    rows.intervals.forEach((lvl) => parts.push(row.bounds?.[lvl]?.upper?.toString() ?? ""));

    lines.push(parts.join(","));

  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;

  link.download = `forecast_${config.model_type}.csv`;

  link.click();

  URL.revokeObjectURL(url);

};



const buildSettingsTooltip = (settings: ForecastConfigState) => {

  const testSplit = settings.test_size_fraction

    ? `${Math.round(settings.test_size_fraction * 100)}%`

    : "0%";

  const levels = settings.level?.length ? settings.level.join(", ") : "None";

  return [

    `Module: ${settings.module_type}`,

    `Model: ${settings.model_type}`,

    `Strategy: ${settings.strategy}`,

    `Freq: ${settings.freq}`,

    `Horizon: h${settings.horizon}`,

    `Season length: ${settings.season_length}`,

    `Test split: ${testSplit}`,

    `Bands: ${levels}`,

    `Log transform: ${settings.log_transform ? "on" : "off"}`,

  ].join("\n");

};



const mapForecastRows = (forecast: ReturnType<typeof useForecast>["forecast"]) => {

  if (!forecast) return { data: [], intervals: [] as number[] };



  const levelOrder = forecast.bounds?.map((b) => b.level) ?? [];

  const boundsByLevel = new Map<number, { lower: number; upper: number }[]>();

  forecast.bounds?.forEach((interval) => {

    boundsByLevel.set(

      interval.level,

      interval.lower.map((lower, idx) => ({ lower, upper: interval.upper[idx] })),

    );

  });



  const data = forecast.timestamps.map((timestamp, idx) => {

    const bounds: Record<number, { lower: number; upper: number }> = {};

    levelOrder.forEach((lvl) => {

      const points = boundsByLevel.get(lvl)?.[idx];

      if (points) bounds[lvl] = points;

    });

    return {

      timestamp,

      forecast: forecast.forecast[idx],

      bounds,

    };

  });



  return { data, intervals: levelOrder };

};



const moduleStyles: Record<

  ForecastConfigState["module_type"],

  { label: "ECON" | "ML" | "DL"; badge: string; dot: string }

> = {

  StatsForecast: {

    label: "ECON",

    badge:

      "bg-[var(--kaito-surface)] text-[var(--kaito-ink)] border-[var(--kaito-border)]",

    dot: "bg-[#c7b299]",

  },

  MLForecast: {

    label: "ML",

    badge:

      "bg-[var(--kaito-surface)] text-[var(--kaito-ink)] border-[var(--kaito-border)]",

    dot: "bg-[#9aad90]",

  },

  NeuralForecast: {

    label: "DL",

    badge:

      "bg-[var(--kaito-surface)] text-[var(--kaito-ink)] border-[var(--kaito-border)]",

    dot: "bg-[#9aa0b5]",

  },

};



const resolveInitialTheme = () => {

  return false;

};



export const App = () => {

  type LeaderboardEntry = {

    id: string;

    model: string;

    module: string;

    rmse?: number | null;

    mae?: number | null;

    mape?: number | null;

    duration: number | null;

    settings: ForecastConfigState;

    createdAt: number;

  };



  const {

    config,

    updateConfig,

    uploadFile,

    runForecast,

    runBenchmark,

    runBacktest,

    saveConfigPreset,

    refreshSavedConfigs,

    deleteSavedConfig,

    preview,

    rows,

    detectedFreq,

    datasets,

    datasetsError,

    loadSampleDataset,

    sampleLoading,

    selectedDataset,

    dataSource,

    history,

    forecast,

    batchResult,

    backtestResult,

    loading,

    error,

    lastRunMs,

    trainTest,

    savedConfigs,

  } = useForecast();

  const { run: triggerForecast, isPending: isRunPending } = useRunForecast(runForecast);



  const [isDark] = useState(resolveInitialTheme);

  const [pendingSampleRun, setPendingSampleRun] = useState(false);

  const [tableTab, setTableTab] = useState<"forecast" | "leaderboard">("forecast");

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const lastLeaderboardKey = useRef<string | null>(null);

  const [selectedBenchmarks, setSelectedBenchmarks] = useState<Record<string, boolean>>({

    auto_arima: true,

    auto_ets: true,

    lightgbm: true,

    gru: false,

  });

  const [backtestWindows, setBacktestWindows] = useState<number>(3);

  const [backtestStep, setBacktestStep] = useState<number>(1);



  useEffect(() => {

    const root = document.documentElement;

    const body = document.body;

    if (isDark) {

      root.classList.add("dark");

      body.classList.add("dark");

      root.style.colorScheme = "dark";

    } else {

      root.classList.remove("dark");

      body.classList.remove("dark");

      root.style.colorScheme = "light";

    }

    localStorage.setItem("theme", isDark ? "dark" : "light");

  }, [isDark]);



  const forecastRows = useMemo(() => mapForecastRows(forecast), [forecast]);

  const intervalLabel = useMemo(

    () =>

      forecast?.bounds?.length ? `${forecast.bounds[forecast.bounds.length - 1].level}%` : "-",

    [forecast],

  );

  const sourceLabel = useMemo(() => {

    if (selectedDataset) return `Sample: ${selectedDataset.name}`;

    if (dataSource === "upload") return "Uploaded CSV";

    return "No data source yet";

  }, [dataSource, selectedDataset]);

  const strategyLabel = useMemo(() => {

    switch (config.strategy) {

      case "multi_step_recursive":

        return "Recursive";

      case "multi_output_direct":

        return "Direct multi-output";

      default:

        return "One step";

    }

  }, [config.strategy]);

  const testSeries = useMemo(() => {

    if (!trainTest?.test || !history?.length) return [];

    const testCount = Math.min(trainTest.test, history.length);

    return history.slice(-testCount);

  }, [history, trainTest]);

  const benchmarkOptions = useMemo(

    () => [

      {

        key: "auto_arima",

        label: "AutoARIMA",

        helper: "StatsForecast automatic ARIMA search.",

        config: {

          ...config,

          module_type: "StatsForecast" as const,

          model_type: "auto_arima",

          strategy: "multi_step_recursive" as const,

        },

      },

      {

        key: "auto_ets",

        label: "AutoETS",

        helper: "StatsForecast exponential smoothing.",

        config: {

          ...config,

          module_type: "StatsForecast" as const,

          model_type: "auto_ets",

          strategy: "multi_step_recursive" as const,

        },

      },

      {

        key: "lightgbm",

        label: "LightGBM",

        helper: "MLForecast tree model with common lags.",

        config: {

          ...config,

          module_type: "MLForecast" as const,

          model_type: "lightgbm",

          lags: config.lags?.length ? config.lags : [1, 7, Math.max(1, config.season_length)],

          strategy: "multi_output_direct" as const,

        },

      },

      {

        key: "gru",

        label: "GRU",

        helper: "NeuralForecast recurrent baseline.",

        config: {

          ...config,

          module_type: "NeuralForecast" as const,

          model_type: "gru",

          input_size: config.input_size ?? Math.max(4, config.season_length),

          num_layers: config.num_layers ?? 1,

          hidden_size: config.hidden_size ?? 32,

          epochs: config.epochs ?? 50,

          strategy: "multi_step_recursive" as const,

        },

      },

    ],

    [config],

  );

  const activeBenchmarkConfigs = useMemo(

    () =>

      benchmarkOptions

        .filter((opt) => selectedBenchmarks[opt.key])

        .map((opt) => opt.config),

    [benchmarkOptions, selectedBenchmarks],

  );

  const hasDataLoaded = useMemo(() => rows > 0 || (history?.length ?? 0) > 0, [history, rows]);

  const firstDataset = datasets.length ? datasets[0] : null;

  const handleQuickStart = async () => {

    if (!firstDataset || loading === "upload") return;

    setPendingSampleRun(true);

    await loadSampleDataset(firstDataset.id);

  };

  const scrollToUpload = () => {

    const el = document.getElementById("upload-card");

    if (el) {

      el.scrollIntoView({ behavior: "smooth", block: "start" });

    }

  };

  const handleBenchmarkRun = () => {

    if (!activeBenchmarkConfigs.length) {

      alert("Select at least one model to benchmark.");

      return;

    }

    runBenchmark(activeBenchmarkConfigs);

  };

  const handleBacktestRun = () => {

    if (!activeBenchmarkConfigs.length) {

      alert("Select at least one model to backtest.");

      return;

    }

    runBacktest(activeBenchmarkConfigs, backtestWindows, backtestStep);

  };

  const handleSaveConfig = async () => {

    const name = prompt("Name this configuration");

    if (!name) return;

    const description = prompt("Optional description?");

    await saveConfigPreset(name, description ?? "");

    await refreshSavedConfigs();

  };

  const handleLoadSavedConfig = (id: string) => {

    const saved = savedConfigs.find((cfg) => cfg.id === id);

    if (!saved) return;

    updateConfig(saved.config);

  };

  const handleDeleteSavedConfig = async (id: string) => {

    const saved = savedConfigs.find((cfg) => cfg.id === id);

    if (!saved) return;

    const confirmed = window.confirm(`Delete saved config "${saved.name}"?`);

    if (!confirmed) return;

    await deleteSavedConfig(id);

  };



  useEffect(() => {

    if (!pendingSampleRun) return;

    if (loading === "upload" || sampleLoading) return;

    if (dataSource === "sample" && history.length) {

      runForecast();

      setPendingSampleRun(false);

    } else if (!sampleLoading && loading === "idle" && dataSource !== "sample") {

      setPendingSampleRun(false);

    }

  }, [dataSource, history, loading, pendingSampleRun, runForecast, sampleLoading]);



  const statusText =

    loading === "forecast"

      ? "Training model..."

      : forecast

        ? "Forecast ready"

        : hasDataLoaded

          ? "Ready to run"

          : "Awaiting data";

  const bestMetric = useMemo(() => {

    const rmse = forecast?.metrics?.rmse;

    if (rmse !== null && rmse !== undefined && !Number.isNaN(rmse))

      return `RMSE ${rmse.toFixed(3)}`;

    const mae = forecast?.metrics?.mae;

    if (mae !== null && mae !== undefined && !Number.isNaN(mae)) return `MAE ${mae.toFixed(3)}`;

    return "No metrics yet";

  }, [forecast?.metrics]);

  const forecastTableRows = useMemo(
    () =>
      forecastRows.data.map((row) => ({
        timestamp: row.timestamp,
        forecast: row.forecast ?? null,
        bounds: row.bounds,
      })),
    [forecastRows],
  );

  useEffect(() => {

    if (!forecast) return;

    const key = `${forecast.config.module_type}-${forecast.config.model_type}-${forecast.timestamps?.[0] ?? ""}-${forecast.forecast?.length ?? 0}`;

    if (lastLeaderboardKey.current === key) return;

    lastLeaderboardKey.current = key;

    const createdAt = Date.now();

    setLeaderboard((prev) => [

      ...prev,

      {

        id: `${createdAt}-${key}`,

        model: forecast.config.model_type.toUpperCase(),

        module: forecast.config.module_type,

        rmse: forecast.metrics?.rmse,

        mae: forecast.metrics?.mae,

        mape: forecast.metrics?.mape,

        duration: lastRunMs ?? null,

        settings: forecast.config,

        createdAt,

      },

    ]);

  }, [forecast, lastRunMs]);

  const leaderboardRows = useMemo(() => {

    const score = (entry: LeaderboardEntry) => {

      const rmse = entry.rmse;

      const mae = entry.mae;

      if (rmse !== null && rmse !== undefined && !Number.isNaN(rmse)) return rmse;

      if (mae !== null && mae !== undefined && !Number.isNaN(mae)) return mae + 1_000_000;

      return Number.POSITIVE_INFINITY;

    };

    return [...leaderboard].sort((a, b) => {

      const diff = score(a) - score(b);

      if (Number.isNaN(diff) || diff === 0) return (b.createdAt ?? 0) - (a.createdAt ?? 0);

      return diff;

    });

  }, [leaderboard]);



  const moduleMeta = moduleStyles[config.module_type];

  const handleLoadLeaderboardConfig = (entry: LeaderboardEntry) => {

    updateConfig(entry.settings);

    setTableTab("forecast");

  };

  const rowsLabel = rows ? rows.toLocaleString() : hasDataLoaded ? "0" : "—";

  const horizonLabel = hasDataLoaded ? `h${config.horizon}` : "N/A";

  const confidenceLabel = intervalLabel || "—";

  const intervalColumns = forecastRows.intervals.length ? forecastRows.intervals : config.level ?? [];



  return (
    <div className={isDark ? "dark" : ""}>
      <PageWrapper className="kaito-shell relative min-h-screen bg-[var(--kaito-bg)] text-[var(--kaito-ink)] transition-colors duration-500 dark:bg-slate-950 dark:text-slate-200">
        <div className="flex min-h-screen">
          <motion.aside
            variants={itemVariants}
            className="hidden w-72 flex-col border-r border-[var(--kaito-border)] bg-[var(--kaito-subtle)] px-5 py-6 shadow-[12px_0_30px_rgba(0,0,0,0.04)] lg:flex dark:border-slate-800 dark:bg-slate-900/40"
          >
            <Link to="/" className="group flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f1c19] font-semibold text-white shadow-sm shadow-black/20 transition group-hover:translate-y-[-2px] group-hover:shadow-lg">
                DC
              </div>
              <div>
                <p className="card-title kaito-meta group-hover:text-[var(--kaito-ink)]">DeepCast</p>
                <p className="kaito-serif text-lg text-slate-900 transition group-hover:text-[var(--kaito-ink)] dark:text-slate-100">
                  Forecast Workbench
                </p>
              </div>
            </Link>



            <div className="mt-6 space-y-3">

              <div className="panel-subtle p-3">

                <p className="card-title">Data status</p>

                <div className="mt-1 flex items-center justify-between">

                  <div className="shrink-0">

                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">

                      {sourceLabel}

                    </p>

                    <p className="text-xs text-slate-600 dark:text-slate-300">

                      {rows ? `${rows} rows` : "Load a sample or upload"}

                    </p>

                  </div>

                  <span className={`h-2 w-2 rounded-full ${moduleMeta.dot}`} />

                </div>

              </div>

              <div className="panel-subtle p-3 space-y-2">

                <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">

                  <span className="font-semibold shrink-0">Module</span>

                  <span

                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${moduleMeta.badge}`}

                  >

                    {moduleMeta.label}

                  </span>

                </div>

                <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">

                  <span className="font-semibold shrink-0">Strategy</span>

                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400">

                    {strategyLabel}

                  </span>

                </div>

                <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">

                  <span className="font-semibold shrink-0">Bands</span>

                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400">

                    {intervalLabel}

                  </span>

                </div>

                <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">

                  <span className="font-semibold shrink-0">Best metric</span>

                  <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">

                    {bestMetric}

                  </span>

                </div>

              </div>

            </div>



            <div className="mt-auto space-y-2 text-xs text-slate-600 dark:text-slate-200">

              {hasDataLoaded ? (

                <p>

                  Need a new dataset? Jump to the cards in the center column to switch samples or

                  upload again.

                </p>

              ) : (

                <p>

                  Pick a sample or upload in the main area to get started. Controls here will appear

                  after data loads.

                </p>

              )}

              {!hasDataLoaded ? (

                <button

                  type="button"

                  onClick={scrollToUpload}

                  className="mt-1 inline-flex items-center gap-2 rounded-full border border-[var(--kaito-border)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]"

                >

                  Upload CSV

                </button>

              ) : null}

            </div>

          </motion.aside>



          <motion.main variants={itemVariants} className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--kaito-border)] bg-[var(--kaito-surface)] px-6 shadow-[0_10px_26px_rgba(0,0,0,0.06)] dark:border-slate-800 dark:bg-slate-950/70">
              <div className="flex items-center gap-3">
                <BrainCircuit className="h-5 w-5 text-[var(--kaito-muted)]" />
                <div>
                  <p className="kaito-serif text-xl font-semibold tracking-[-0.02em] text-slate-900 dark:text-slate-100">
                    DeepCast Workbench
                  </p>
                  <p className="kaito-meta text-[var(--kaito-muted)]">Warm utility workspace for forecasts</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-[var(--kaito-border)] bg-[var(--kaito-surface)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--kaito-muted)] shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                  {dataSource === "upload"
                    ? "Uploaded CSV"
                    : selectedDataset
                      ? selectedDataset.name
                      : "Idle"}
                </span>
                <span className="kaito-meta rounded-full border border-[var(--kaito-border)] bg-[var(--kaito-surface)] px-3 py-1.5 shadow-sm">
                  Warm utility
                </span>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto">
              <div className="content-boundary py-8 lg:py-12">
                <div className="dashboard-shell">
                  {error && (
                    <div className="panel border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                      <div className="flex items-start gap-3 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5" />
                        <div>
                          <p className="font-semibold">Request failed</p>
                          <p className="text-sm">{error}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <TopKpiRow
                    rowsLabel={rowsLabel}
                    horizonLabel={horizonLabel}
                    confidenceLabel={confidenceLabel}
                    statusLabel={statusText}
                    bestMetric={bestMetric}
                  />

                  <ForecastChart
                    history={history}
                    forecast={forecast}
                    testSet={testSeries}
                    accentColor="#37413a"
                    secondaryColor="#7c8172"
                    warmColor="#b08968"
                    metrics={forecast?.metrics}
                    modelLabel={
                      forecast ? forecast.config.model_type.toUpperCase() : config.model_type.toUpperCase()
                    }
                    runDurationMs={lastRunMs}
                    loading={loading === "forecast"}
                    onQuickStart={firstDataset ? handleQuickStart : undefined}
                    quickLabel={firstDataset ? `Try ${firstDataset.name}` : undefined}
                  />

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px,1fr]">
                    <div className="relative space-y-4 lg:pr-2">
                      <div className="space-y-4 pb-28">
                        <SampleDatasetPicker
                          datasets={datasets}
                          activeId={selectedDataset?.id ?? null}
                          loadingId={sampleLoading}
                          error={datasetsError}
                          onSelect={loadSampleDataset}
                        />

                        <div id="upload-card">
                          <FileUpload
                            onUpload={uploadFile}
                            loading={loading === "upload"}
                            preview={preview}
                            rows={rows}
                          />
                        </div>

                        <ConfigPanel
                          config={config}
                          onChange={updateConfig}
                          onRun={() => triggerForecast(undefined)}
                          running={loading === "forecast" || isRunPending}
                          dataReady={hasDataLoaded}
                          detectedFreq={detectedFreq ?? selectedDataset?.freq ?? null}
                          disabled={loading === "upload" || isRunPending}
                        />
                      </div>
                    </div>

                    <div className="panel p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="card-title">Forecast table</p>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            Horizon details
                          </h3>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                          {forecast ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              <span>Using {forecast.config.model_type.toUpperCase()}</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-4 w-4 text-amber-500" />
                              <span>Run a forecast to populate the table.</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setTableTab("forecast")}
                          className={`rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] transition ${tableTab === "forecast" ? "border-[var(--kaito-border)] bg-[var(--kaito-surface)] text-[var(--kaito-ink)] shadow-[0_10px_28px_rgba(0,0,0,0.06)]" : "border-transparent text-[var(--kaito-muted)] hover:border-[var(--kaito-border)]"}`}
                        >
                          Forecast data
                        </button>

                        <button
                          type="button"
                          onClick={() => setTableTab("leaderboard")}
                          className={`rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] transition ${tableTab === "leaderboard" ? "border-[var(--kaito-border)] bg-[var(--kaito-surface)] text-[var(--kaito-ink)] shadow-[0_10px_28px_rgba(0,0,0,0.06)]" : "border-transparent text-[var(--kaito-muted)] hover:border-[var(--kaito-border)]"}`}
                        >
                          Model leaderboard
                        </button>
                      </div>

                      {!forecast && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                          {config.module_type === "StatsForecast" && (
                            <p>
                              Statistical baselines (ARIMA/ETS/naive) are fast and strong for single-series data. Pick
                              the specific model below; switch modules to surface ML or neural options.
                            </p>
                          )}
                          {config.module_type === "MLForecast" && (
                            <p>
                              MLForecast wraps tree/linear regressors with lag features. Use the module toggle above to
                              swap into neural models when you want deeper fits.
                            </p>
                          )}
                          {config.module_type === "NeuralForecast" && (
                            <p>
                              NeuralForecast exposes feed-forward and recurrent nets (MLP/RNN/LSTM/GRU). Adjust hidden
                              size/epochs in advanced settings if you need more capacity.
                            </p>
                          )}
                        </div>
                      )}

                      {tableTab === "forecast" ? (
                        <>
                          <div className="mt-3">
                            {forecastTableRows.length ? (
                              <ForecastDataTable data={forecastTableRows} intervals={intervalColumns} />
                            ) : (
                              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                                Run a forecast to populate the horizon table.
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-xs text-slate-600 dark:text-slate-400">
                              {forecast ? "Download this horizon as CSV." : "CSV export available after a run."}
                            </div>
                            <button
                              type="button"
                              disabled={!forecastRows.data.length}
                              onClick={() => buildDownloadCsv(config, forecastRows)}
                              className="inline-flex items-center gap-2 rounded-full border border-[var(--kaito-border)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Download className="h-4 w-4" />
                              Download CSV
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
                          {leaderboardRows.length ? (
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-100 text-left text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">Model</th>
                                  <th className="px-3 py-2 font-semibold">Module</th>
                                  <th className="px-3 py-2 font-semibold">Settings</th>
                                  <th className="px-3 py-2 font-semibold text-right">RMSE</th>
                                  <th className="px-3 py-2 font-semibold text-right">MAE</th>
                                  <th className="px-3 py-2 font-semibold text-right">MAPE</th>
                                  <th className="px-3 py-2 font-semibold text-right">Train time</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 text-slate-900 dark:divide-slate-800 dark:text-slate-100">
                                {leaderboardRows.map((row) => (
                                  <tr
                                    key={row.id}
                                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                    onClick={() => handleLoadLeaderboardConfig(row)}
                                  >
                                    <td className="px-3 py-2 font-semibold">{row.model}</td>
                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{row.module}</td>
                                    <td className="px-3 py-2">
                                      <span
                                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:text-slate-200"
                                        title={buildSettingsTooltip(row.settings)}
                                      >
                                        <Info className="h-3.5 w-3.5" />
                                        View
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono">
                                      {row.rmse !== null && row.rmse !== undefined && !Number.isNaN(row.rmse)
                                        ? row.rmse.toFixed(3)
                                        : "-"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono">
                                      {row.mae !== null && row.mae !== undefined && !Number.isNaN(row.mae)
                                        ? row.mae.toFixed(3)
                                        : "-"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono">
                                      {row.mape !== null && row.mape !== undefined && !Number.isNaN(row.mape)
                                        ? row.mape.toFixed(3)
                                        : "-"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono">
                                      {row.duration !== null && row.duration !== undefined ? `${row.duration} ms` : "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="px-4 py-5 text-sm text-slate-600 dark:text-slate-300">
                              Run a forecast first, then use this tab to compare metrics across models. Swap modules and
                              rerun to build a quick leaderboard.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="panel p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="card-title">Benchmark &amp; Backtest</p>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          Compare models and rolling windows
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSaveConfig}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--kaito-border)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
                        >
                          Save current config
                        </button>
                        <button
                          type="button"
                          onClick={handleBenchmarkRun}
                          disabled={!hasDataLoaded || loading === "benchmark"}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--kaito-border)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loading === "benchmark" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <BrainCircuit className="h-4 w-4" />
                          )}
                          Run benchmark
                        </button>
                        <button
                          type="button"
                          onClick={handleBacktestRun}
                          disabled={!hasDataLoaded || loading === "backtest"}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--kaito-border)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loading === "backtest" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Activity className="h-4 w-4" />
                          )}
                          Backtest
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[320px,1fr]">
                      <div className="space-y-4 rounded-xl border border-[var(--kaito-border)] bg-[var(--kaito-surface)] p-5 shadow-[0_16px_38px_rgba(0,0,0,0.04)]">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Benchmark set</p>

                        <div className="space-y-2">
                          {benchmarkOptions.map((opt) => (
                            <label
                              key={opt.key}
                              className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-[var(--kaito-border)] bg-[var(--kaito-surface)] px-3 py-2 text-sm text-[var(--kaito-ink)] shadow-sm transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
                            >
                              <div className="space-y-1">
                                <div className="font-semibold">{opt.label}</div>
                                <p className="text-xs text-[var(--kaito-muted)] dark:text-slate-400">{opt.helper}</p>
                              </div>
                              <input
                                type="checkbox"
                                className="mt-1 accent-[#2b2b2b]"
                                checked={Boolean(selectedBenchmarks[opt.key])}
                                onChange={(e) =>
                                  setSelectedBenchmarks((prev) => ({
                                    ...prev,
                                    [opt.key]: e.target.checked,
                                  }))
                                }
                              />
                            </label>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-[var(--kaito-muted)] dark:text-slate-300" htmlFor="backtest-windows">
                              Backtest windows
                            </label>
                            <input
                              id="backtest-windows"
                              type="number"
                              min={1}
                              className="mt-1 w-full rounded-lg border border-[var(--kaito-border)] bg-[var(--kaito-surface)] px-3 py-2 text-sm text-[var(--kaito-ink)] focus:border-[var(--kaito-border)] focus:outline-none"
                              value={backtestWindows}
                              onChange={(e) => setBacktestWindows(Math.max(1, Number(e.target.value)))}
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-[var(--kaito-muted)] dark:text-slate-300" htmlFor="backtest-step">
                              Step size
                            </label>
                            <input
                              id="backtest-step"
                              type="number"
                              min={1}
                              className="mt-1 w-full rounded-lg border border-[var(--kaito-border)] bg-[var(--kaito-surface)] px-3 py-2 text-sm text-[var(--kaito-ink)] focus:border-[var(--kaito-border)] focus:outline-none"
                              value={backtestStep}
                              onChange={(e) => setBacktestStep(Math.max(1, Number(e.target.value)))}
                            />
                          </div>
                        </div>

                        <p className="text-xs text-[var(--kaito-muted)] dark:text-slate-300">
                          Select at least one model, then run benchmark for single split or backtest for rolling windows.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-xl border border-[var(--kaito-border)] bg-[var(--kaito-surface)] p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-[var(--kaito-ink)] dark:text-slate-100">Batch leaderboard</p>
                            <span className="text-xs text-[var(--kaito-muted)] dark:text-slate-400">Multi-model run on current dataset</span>
                          </div>

                          {batchResult?.leaderboard?.length ? (
                            <table className="mt-2 min-w-full text-sm">
                              <thead className="bg-[var(--kaito-subtle)] text-left text-[var(--kaito-muted)] dark:bg-slate-800 dark:text-slate-300">
                                <tr>
                                  <th className="px-2 py-1 font-semibold">Model</th>
                                  <th className="px-2 py-1 font-semibold">Module</th>
                                  <th className="px-2 py-1 font-semibold text-right">RMSE</th>
                                  <th className="px-2 py-1 font-semibold text-right">MAE</th>
                                  <th className="px-2 py-1 font-semibold text-right">MAPE</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--kaito-border)] text-[var(--kaito-ink)] dark:divide-slate-700 dark:text-slate-100">
                                {batchResult.leaderboard.map((row) => (
                                  <tr key={`${row.model_label}-${row.config.model_type}`}>
                                    <td className="px-2 py-1 font-semibold">{row.model_label}</td>
                                    <td className="px-2 py-1 text-[var(--kaito-muted)] dark:text-slate-300">{row.module_type}</td>
                                    <td className="px-2 py-1 text-right font-mono">{row.metrics.rmse ?? "-"}</td>
                                    <td className="px-2 py-1 text-right font-mono">{row.metrics.mae ?? "-"}</td>
                                    <td className="px-2 py-1 text-right font-mono">{row.metrics.mape ?? "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="mt-2 text-sm text-[var(--kaito-muted)] dark:text-slate-300">
                              Run benchmark to populate comparisons across models.
                            </div>
                          )}
                        </div>
                        <div className="rounded-xl border border-[var(--kaito-border)] bg-[var(--kaito-surface)] p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-[var(--kaito-ink)] dark:text-slate-100">Backtest summary</p>
                            <span className="text-xs text-[var(--kaito-muted)] dark:text-slate-400">Rolling windows</span>
                          </div>

                          {backtestResult?.leaderboard?.length ? (
                            <table className="mt-2 min-w-full text-sm">
                              <thead className="bg-[var(--kaito-subtle)] text-left text-[var(--kaito-muted)] dark:bg-slate-800 dark:text-slate-300">
                                <tr>
                                  <th className="px-2 py-1 font-semibold">Model</th>
                                  <th className="px-2 py-1 font-semibold">RMSE</th>
                                  <th className="px-2 py-1 font-semibold">MAE</th>
                                  <th className="px-2 py-1 font-semibold">MAPE</th>
                                  <th className="px-2 py-1 font-semibold text-right">Windows</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--kaito-border)] text-[var(--kaito-ink)] dark:divide-slate-700 dark:text-slate-100">
                                {backtestResult.results.map((row) => (
                                  <tr key={`${row.config.model_type}-${row.config.module_type}`}>
                                    <td className="px-2 py-1 font-semibold">
                                      {row.config.module_type}/{row.config.model_type}
                                    </td>
                                    <td className="px-2 py-1 text-right font-mono">{row.aggregate.rmse ?? "-"}</td>
                                    <td className="px-2 py-1 text-right font-mono">{row.aggregate.mae ?? "-"}</td>
                                    <td className="px-2 py-1 text-right font-mono">{row.aggregate.mape ?? "-"}</td>
                                    <td className="px-2 py-1 text-right font-mono">{row.windows.length}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="mt-2 text-sm text-[var(--kaito-muted)] dark:text-slate-300">
                              Backtest results appear here with per-model aggregates.
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-[var(--kaito-border)] bg-[var(--kaito-surface)] p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-[var(--kaito-ink)] dark:text-slate-100">Saved configs</p>
                            <button
                              type="button"
                              onClick={refreshSavedConfigs}
                              className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--kaito-muted)] transition hover:text-[var(--kaito-ink)]"
                            >
                              Refresh
                            </button>
                          </div>

                          {savedConfigs.length ? (
                            <ul className="mt-2 space-y-2 text-sm text-slate-800 dark:text-slate-200">
                              {savedConfigs.map((item) => (
                                <li
                                  key={item.id}
                                  className="flex items-center justify-between rounded-lg border border-[var(--kaito-border)] bg-[var(--kaito-subtle)] px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70"
                                >
                                  <div>
                                    <p className="font-semibold">{item.name}</p>
                                    {item.description ? (
                                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleLoadSavedConfig(item.id)}
                                      className="rounded-full border border-[var(--kaito-border)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
                                    >
                                      Load
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSavedConfig(item.id)}
                                      className="rounded-full border border-[var(--kaito-border)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                              Save a configuration to reuse it later or share with teammates.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.main>
    </div>
  </PageWrapper>
</div>

  );

};



export default App;



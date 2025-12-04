import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { AlertCircle, BrainCircuit, CheckCircle2, Download, Info, Loader2 } from "lucide-react";

import { ConfigPanel } from "./components/ConfigPanel";
import { FileUpload } from "./components/FileUpload";
import { ForecastChart } from "./components/ForecastChart";
import { ForecastDataTable } from "./components/ForecastDataTable";
import { PageWrapper, containerVariants, fluidEase, itemVariants } from "./components/PageWrapper";
import { SampleDatasetPicker } from "./components/SampleDatasetPicker";
import { TopKpiRow } from "./components/TopKpiRow";
import { RevealText } from "./components/ui/Reveal";
import { useForecast } from "./hooks/useForecast";
import { useRunForecast } from "./hooks/useRunForecast";
import { MODEL_OPTIONS } from "./constants/models";
import { cleanModelName, formatModelName } from "./utils/modelNames";
import type { ForecastConfigState, ForecastRun, ModuleType } from "./types";



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



const buildParametersTooltip = (settings: ForecastConfigState) => {

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



const mapForecastRows = (forecast: ForecastRun | null) => {

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




const getMetricClass = (value: number | null | undefined, minVal: number) => {
  if (value === null || value === undefined) return "";
  return Math.abs(value - minVal) < 0.0001
    ? "bg-yellow-100 font-bold text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-200 rounded px-1"
    : "";
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

    forecast: latestForecast,

    forecastHistory,

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

  const leaderboardRunIds = useRef<Set<string>>(new Set());

  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isRunningFullAnalysis, setIsRunningFullAnalysis] = useState(false);

  const [selectedBenchmarks, setSelectedBenchmarks] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    (Object.entries(MODEL_OPTIONS) as [ModuleType, readonly string[]][]).forEach(
      ([module, models]) => {
        models.forEach((model) => {
          defaults[`${module}-${model}`] = true;
        });
      },
    );
    return defaults;
  });

  const [backtestWindows, setBacktestWindows] = useState<number>(3);

  const [backtestStep, setBacktestStep] = useState<number>(1);

  const startResizing = useCallback(
    (mouseDownEvent: React.MouseEvent) => {
      mouseDownEvent.preventDefault();
      const startX = mouseDownEvent.clientX;
      const startWidth = sidebarWidth;

      const doDrag = (mouseMoveEvent: MouseEvent) => {
        setSidebarWidth(Math.max(260, Math.min(600, startWidth + mouseMoveEvent.clientX - startX)));
      };

      const stopDrag = () => {
        document.documentElement.removeEventListener("mousemove", doDrag);
        document.documentElement.removeEventListener("mouseup", stopDrag);
        document.body.style.cursor = "default";
      };

      document.documentElement.addEventListener("mousemove", doDrag);
      document.documentElement.addEventListener("mouseup", stopDrag);
      document.body.style.cursor = "col-resize";
    },
    [sidebarWidth],
  );



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



  const forecastRows = useMemo(() => mapForecastRows(latestForecast), [latestForecast]);

  const intervalLabel = useMemo(

    () =>

      latestForecast?.bounds?.length
        ? `${latestForecast.bounds[latestForecast.bounds.length - 1].level}%`
        : "-",

    [latestForecast],

  );

  const testSeries = useMemo(() => {

    if (!trainTest?.test || !history?.length) return [];

    const testCount = Math.min(trainTest.test, history.length);

    return history.slice(-testCount);

  }, [history, trainTest]);

  const benchmarkOptions = useMemo(() => {
    const helperText: Record<string, string> = {
      "StatsForecast.auto_arima": "Automatic ARIMA search.",
      "StatsForecast.auto_ets": "ETS tuned smoothing.",
      "StatsForecast.seasonal_naive": "Seasonal naive anchor.",
      "StatsForecast.random_walk_with_drift": "Random walk with drift baseline.",
      "MLForecast.lightgbm": "Tree model with lagged regressors.",
      "MLForecast.xgboost": "Boosted trees with lags.",
      "MLForecast.linear": "Linear regressor with lag stack.",
      "NeuralForecast.gru": "Recurrent baseline.",
      "NeuralForecast.lstm": "LSTM recurrent net.",
      "NeuralForecast.mlp": "Feed-forward net.",
      "NeuralForecast.rnn": "Vanilla RNN baseline.",
    };

    const buildConfigFor = (module: ModuleType, model: string): ForecastConfigState => {
      if (module === "StatsForecast") {
        return {
          ...config,
          module_type: module,
          model_type: model,
          strategy: "multi_step_recursive" as const,
        };
      }
      if (module === "MLForecast") {
        return {
          ...config,
          module_type: module,
          model_type: model,
          lags: config.lags?.length ? config.lags : [1, 7, Math.max(1, config.season_length)],
          strategy: "multi_output_direct" as const,
        };
      }
      if (module === "NeuralForecast") {
        return {
          ...config,
          module_type: module,
          model_type: model,
          input_size: config.input_size ?? Math.max(4, config.season_length),
          num_layers: config.num_layers ?? 1,
          hidden_size: config.hidden_size ?? 32,
          epochs: config.epochs ?? 50,
          strategy: "multi_step_recursive" as const,
        };
      }
      return { ...config, module_type: module, model_type: model };
    };

    const options: {
      key: string;
      label: string;
      helper: string;
      config: ForecastConfigState;
      module: ModuleType;
      model: string;
    }[] = [];

    (Object.keys(MODEL_OPTIONS) as ModuleType[]).forEach((module) => {
      MODEL_OPTIONS[module].forEach((model) => {
        const key = `${module}-${model}`;
        const label = cleanModelName(model);
        const helperKey = `${module}.${model}`;
        const helper =
          helperText[helperKey] ??
          helperText[model] ??
          `${label} candidate from ${module}.`;
        options.push({
          key,
          label,
          helper,
          config: buildConfigFor(module, model),
          module,
          model,
        });
      });
    });

    return options;
  }, [config]);

  const activeBenchmarkConfigs = useMemo(
    () => benchmarkOptions.filter((opt) => selectedBenchmarks[opt.key]).map((opt) => opt.config),
    [benchmarkOptions, selectedBenchmarks],
  );

  const hasDataLoaded = useMemo(() => rows > 0 || (history?.length ?? 0) > 0, [history, rows]);

  const firstDataset = datasets.length ? datasets[0] : null;

  const handleQuickStart = async () => {

    if (!firstDataset || loading === "upload") return;

    setPendingSampleRun(true);

    await loadSampleDataset(firstDataset.id);

  };

  const handleRunFullAnalysis = async () => {
    const candidates = activeBenchmarkConfigs.length
      ? activeBenchmarkConfigs
      : benchmarkOptions.map((opt) => opt.config);

    if (!candidates.length) {
      alert("Select at least one model to analyze.");
      return;
    }

    if (!hasDataLoaded) {
      alert("Load data before running the leaderboard analysis.");
      return;
    }

    setIsRunningFullAnalysis(true);
    setTableTab("leaderboard");
    try {
      await runBenchmark(candidates);
      await runBacktest(candidates, backtestWindows, backtestStep);
    } finally {
      setIsRunningFullAnalysis(false);
    }
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

      : latestForecast

        ? "Forecast ready"

        : hasDataLoaded

          ? "Ready to run"

          : "Awaiting data";

  const bestMetric = useMemo(() => {

    const rmse = latestForecast?.metrics?.rmse;

    if (rmse !== null && rmse !== undefined && !Number.isNaN(rmse))

      return `RMSE ${rmse.toFixed(3)}`;

    const mae = latestForecast?.metrics?.mae;

    if (mae !== null && mae !== undefined && !Number.isNaN(mae)) return `MAE ${mae.toFixed(3)}`;

    return "No metrics yet";

  }, [latestForecast?.metrics]);

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
    if (!forecastHistory.length) return;

    const newEntries: LeaderboardEntry[] = [];

    forecastHistory.forEach((run) => {
      const key =
        run.runId ||
        `${run.config.module_type}-${run.config.model_type}-${run.timestamps?.[0] ?? ""}-${run.forecast?.length ?? 0}`;
      if (leaderboardRunIds.current.has(key)) return;
      leaderboardRunIds.current.add(key);
      const createdAt = run.createdAt ?? Date.now();
      newEntries.push({
        id: `${createdAt}-${key}`,
        model: formatModelName(run.config.module_type, run.config.model_type),
        module: run.config.module_type,
        rmse: run.metrics?.rmse,
        mae: run.metrics?.mae,
        mape: run.metrics?.mape,
        duration: run.durationMs ?? null,
        settings: run.config,
        createdAt,
      });
    });

    if (newEntries.length) {
      setLeaderboard((prev) => [...prev, ...newEntries]);
    }
  }, [forecastHistory]);

  useEffect(() => {
    if (forecastHistory.length === 0) {
      setLeaderboard([]);
      leaderboardRunIds.current.clear();
    }
  }, [forecastHistory.length]);

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

  const leaderboardMins = useMemo(() => {
    const rmseVals = leaderboardRows
      .map((row) => row.rmse)
      .filter((val): val is number => val !== null && val !== undefined && !Number.isNaN(val));
    const maeVals = leaderboardRows
      .map((row) => row.mae)
      .filter((val): val is number => val !== null && val !== undefined && !Number.isNaN(val));
    const mapeVals = leaderboardRows
      .map((row) => row.mape)
      .filter((val): val is number => val !== null && val !== undefined && !Number.isNaN(val));
    return {
      rmse: rmseVals.length ? Math.min(...rmseVals) : Number.POSITIVE_INFINITY,
      mae: maeVals.length ? Math.min(...maeVals) : Number.POSITIVE_INFINITY,
      mape: mapeVals.length ? Math.min(...mapeVals) : Number.POSITIVE_INFINITY,
    };
  }, [leaderboardRows]);

  const batchLeaderboardMins = useMemo(() => {
    const rows = batchResult?.leaderboard ?? [];
    const rmseVals = rows
      .map((row) => row.metrics.rmse)
      .filter((val): val is number => val !== null && val !== undefined && !Number.isNaN(val));
    const maeVals = rows
      .map((row) => row.metrics.mae)
      .filter((val): val is number => val !== null && val !== undefined && !Number.isNaN(val));
    const mapeVals = rows
      .map((row) => row.metrics.mape)
      .filter((val): val is number => val !== null && val !== undefined && !Number.isNaN(val));
    return {
      rmse: rmseVals.length ? Math.min(...rmseVals) : Number.POSITIVE_INFINITY,
      mae: maeVals.length ? Math.min(...maeVals) : Number.POSITIVE_INFINITY,
      mape: mapeVals.length ? Math.min(...mapeVals) : Number.POSITIVE_INFINITY,
    };
  }, [batchResult]);

  const backtestAggregateMins = useMemo(() => {
    const rows = backtestResult?.results ?? [];
    const rmseVals = rows
      .map((row) => row.aggregate.rmse)
      .filter((val): val is number => val !== null && val !== undefined && !Number.isNaN(val));
    const maeVals = rows
      .map((row) => row.aggregate.mae)
      .filter((val): val is number => val !== null && val !== undefined && !Number.isNaN(val));
    const mapeVals = rows
      .map((row) => row.aggregate.mape)
      .filter((val): val is number => val !== null && val !== undefined && !Number.isNaN(val));
    return {
      rmse: rmseVals.length ? Math.min(...rmseVals) : Number.POSITIVE_INFINITY,
      mae: maeVals.length ? Math.min(...maeVals) : Number.POSITIVE_INFINITY,
      mape: mapeVals.length ? Math.min(...mapeVals) : Number.POSITIVE_INFINITY,
    };
  }, [backtestResult]);



  const handleLoadLeaderboardConfig = (entry: LeaderboardEntry) => {

    updateConfig(entry.settings);

    setTableTab("forecast");

  };

  const rowsLabel = rows ? rows.toLocaleString() : hasDataLoaded ? "0" : "—";

  const horizonLabel = hasDataLoaded ? `h${config.horizon}` : "N/A";

  const confidenceLabel = intervalLabel || "—";

  const intervalColumns = forecastRows.intervals.length
    ? forecastRows.intervals
    : latestForecast?.config.level ?? config.level ?? [];

  const analysisIsLoading = isRunningFullAnalysis || loading === "benchmark" || loading === "backtest";


  const hoverSpring = { type: "spring", stiffness: 400, damping: 17 };

  return (
    <div className={isDark ? "dark" : ""}>
      <PageWrapper className="kaito-shell relative flex h-screen flex-col items-stretch overflow-hidden overflow-y-auto bg-[var(--kaito-bg)] text-[var(--kaito-ink)] transition-colors duration-500 dark:bg-slate-950 dark:text-slate-200 lg:flex-row lg:overflow-hidden">
        <motion.aside
          layout
          variants={itemVariants}
          custom={0}
          transition={{ layout: { duration: 0.6, ease: fluidEase } }}
          style={{
            width: `${sidebarWidth}px`,
            minWidth: "260px",
            maxWidth: "min(600px, 100%)",
            flexBasis: `${sidebarWidth}px`,
          }}
          className="relative w-full h-screen flex-shrink-0 overflow-y-auto border-b border-[var(--kaito-border)] bg-[var(--kaito-subtle)] px-5 py-6 shadow-[0_10px_24px_rgba(0,0,0,0.04)] no-scrollbar lg:h-full lg:flex-shrink-0 lg:border-b-0 lg:border-r lg:shadow-[12px_0_30px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-slate-900/40"
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

            <motion.div className="mt-6 space-y-4 pb-4" variants={containerVariants} layout>
              <div className="panel-subtle p-4">
                <p className="card-title">Forecast setup</p>
                <p className="text-sm text-[var(--kaito-muted)] dark:text-slate-300">
                  Load data, upload a CSV, and tune the run without leaving the sidebar.
                </p>
              </div>

              <motion.div variants={itemVariants} layout>
                <SampleDatasetPicker
                  datasets={datasets}
                  activeId={selectedDataset?.id ?? null}
                  loadingId={sampleLoading}
                  error={datasetsError}
                  onSelect={loadSampleDataset}
                />
              </motion.div>

              <motion.div id="upload-card" variants={itemVariants} layout>
                <FileUpload
                  onUpload={uploadFile}
                  loading={loading === "upload"}
                  preview={preview}
                  rows={rows}
                  dataSource={dataSource}
                />
              </motion.div>

              <motion.div variants={itemVariants} layout custom={0.06}>
                <ConfigPanel
                  config={config}
                  onChange={updateConfig}
                  onRun={() => triggerForecast(undefined)}
                  running={loading === "forecast" || isRunPending}
                  dataReady={hasDataLoaded}
                  detectedFreq={detectedFreq ?? selectedDataset?.freq ?? null}
              disabled={loading === "upload" || isRunPending}
                />
              </motion.div>
            </motion.div>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={startResizing}
              className="absolute right-0 top-0 h-full w-1 cursor-col-resize rounded-r-lg bg-transparent transition hover:bg-indigo-500/50"
            />
          </motion.aside>

        <motion.main
          layout
          variants={itemVariants}
          custom={0.12}
          transition={{ layout: { duration: 0.6, ease: fluidEase } }}
          className="flex min-w-0 flex-1 flex-col h-full min-h-0 overflow-hidden"
        >
          <motion.header
            layout
            variants={itemVariants}
            custom={0.18}
            className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--kaito-border)] bg-[var(--kaito-surface)] px-6 shadow-[0_10px_26px_rgba(0,0,0,0.06)] dark:border-slate-800 dark:bg-slate-950/70"
          >
            <div className="flex items-center gap-3">
              <BrainCircuit className="h-5 w-5 text-[var(--kaito-muted)]" />
              <div>
                <RevealText
                  as="p"
                  delay={0.08}
                  className="kaito-serif text-xl font-semibold tracking-[-0.02em] text-slate-900 dark:text-slate-100"
                >
                  DeepCast Workbench
                </RevealText>
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
          </motion.header>

          <motion.div className="flex-1 overflow-y-auto min-h-0" layout>
            <div className="content-boundary py-8 lg:py-12">
              <motion.div className="dashboard-shell" variants={containerVariants}>
                {error && (
                  <motion.div
                    variants={itemVariants}
                    layout
                    className="panel border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
                  >
                    <div className="flex items-start gap-3 p-4">
                      <AlertCircle className="mt-0.5 h-5 w-5" />
                      <div>
                        <p className="font-semibold">Request failed</p>
                        <p className="text-sm">{error}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                <motion.div
                  variants={itemVariants}
                  layout
                  custom={0.2}
                  key={`chart-${forecastHistory.length}-${batchResult?.results?.length ?? 0}`}
                  initial={{ opacity: 0.85 }}
                  animate={{ opacity: forecastHistory.length ? 1 : 0.95 }}
                  transition={{
                    layout: { duration: 0.6, ease: fluidEase },
                    opacity: { duration: 0.6, ease: "easeOut" },
                  }}
                >
                  <ForecastChart
                    history={history}
                    forecasts={forecastHistory}
                    testSet={testSeries}
                    accentColor="#37413a"
                    secondaryColor="#7c8172"
                    warmColor="#b08968"
                    metrics={latestForecast?.metrics}
                    modelLabel={
                      latestForecast
                        ? formatModelName(latestForecast.config.module_type, latestForecast.config.model_type)
                        : formatModelName(config.module_type, config.model_type)
                    }
                    runDurationMs={latestForecast?.durationMs ?? lastRunMs}
                    loading={loading === "forecast"}
                    onQuickStart={firstDataset ? handleQuickStart : undefined}
                    quickLabel={firstDataset ? `Try ${firstDataset.name}` : undefined}
                  />
                </motion.div>

                <motion.div variants={itemVariants} layout custom={0.26}>
                  <TopKpiRow
                    rowsLabel={rowsLabel}
                    horizonLabel={horizonLabel}
                    confidenceLabel={confidenceLabel}
                    statusLabel={statusText}
                    bestMetric={bestMetric}
                  />
                </motion.div>

                <motion.div variants={itemVariants} layout custom={0.34}>
                  <div className="mt-8 space-y-6">
                    <motion.div className="panel p-4" layout variants={itemVariants} custom={0.38}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="card-title">Forecast table</p>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            Horizon details
                          </h3>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                          {latestForecast ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              <span>
                                Using{" "}
                                {formatModelName(
                                  latestForecast.config.module_type,
                                  latestForecast.config.model_type,
                                )}
                              </span>
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
                        <motion.button
                          type="button"
                          onClick={() => setTableTab("forecast")}
                          whileHover={{ y: -2, scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          transition={hoverSpring}
                          className={`rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] transition ${tableTab === "forecast" ? "border-[var(--kaito-border)] bg-[var(--kaito-surface)] text-[var(--kaito-ink)] shadow-[0_10px_28px_rgba(0,0,0,0.06)]" : "border-transparent text-[var(--kaito-muted)] hover:border-[var(--kaito-border)]"}`}
                        >
                          Forecast data
                        </motion.button>

                        <motion.button
                          type="button"
                          onClick={() => setTableTab("leaderboard")}
                          whileHover={{ y: -2, scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          transition={hoverSpring}
                          className={`rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] transition ${tableTab === "leaderboard" ? "border-[var(--kaito-border)] bg-[var(--kaito-surface)] text-[var(--kaito-ink)] shadow-[0_10px_28px_rgba(0,0,0,0.06)]" : "border-transparent text-[var(--kaito-muted)] hover:border-[var(--kaito-border)]"}`}
                        >
                          Model leaderboard
                        </motion.button>
                      </div>

                      {!latestForecast && (
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
                          <div className="mt-3 max-h-[500px] overflow-y-auto scroll-smooth">
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
                              {latestForecast
                                ? "Download this horizon as CSV."
                                : "CSV export available after a run."}
                            </div>
                            <motion.button
                              type="button"
                              disabled={!forecastRows.data.length}
                              onClick={() => buildDownloadCsv(latestForecast?.config ?? config, forecastRows)}
                              whileHover={{ y: -2, scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                              transition={hoverSpring}
                              className="inline-flex items-center gap-2 rounded-full border border-[var(--kaito-border)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Download className="h-4 w-4" />
                              Download CSV
                            </motion.button>
                          </div>
                        </>
                      ) : (
                        <div className="mt-3 max-h-[500px] overflow-y-auto scroll-smooth rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
                          {leaderboardRows.length ? (
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-100 text-left text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">Model</th>
                                  <th className="px-3 py-2 font-semibold">Module</th>
                                  <th className="px-3 py-2 font-semibold">Parameters</th>
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
                                        title={buildParametersTooltip(row.settings)}
                                      >
                                        <Info className="h-3.5 w-3.5" />
                                        View
                                      </span>
                                    </td>
                                    <td
                                      className={`px-3 py-2 text-right font-mono ${getMetricClass(row.rmse, leaderboardMins.rmse)}`}
                                    >
                                      {row.rmse !== null && row.rmse !== undefined && !Number.isNaN(row.rmse)
                                        ? row.rmse.toFixed(2)
                                        : "-"}
                                    </td>
                                    <td
                                      className={`px-3 py-2 text-right font-mono ${getMetricClass(row.mae, leaderboardMins.mae)}`}
                                    >
                                      {row.mae !== null && row.mae !== undefined && !Number.isNaN(row.mae)
                                        ? row.mae.toFixed(2)
                                        : "-"}
                                    </td>
                                    <td
                                      className={`px-3 py-2 text-right font-mono ${getMetricClass(row.mape, leaderboardMins.mape)}`}
                                    >
                                      {row.mape !== null && row.mape !== undefined && !Number.isNaN(row.mape)
                                        ? row.mape.toFixed(2)
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
                    </motion.div>

                    <motion.div className="panel p-4" layout variants={itemVariants} custom={0.42}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="card-title">Benchmark &amp; Backtest</p>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            Compare models and rolling windows
                          </h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <motion.button
                            type="button"
                            onClick={handleSaveConfig}
                            whileHover={{ y: -2, scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            transition={hoverSpring}
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--kaito-border)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
                          >
                            Save current config
                          </motion.button>
                          <motion.button
                            type="button"
                            onClick={handleRunFullAnalysis}
                            disabled={!hasDataLoaded || analysisIsLoading}
                            whileHover={{ y: -2, scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            transition={hoverSpring}
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--kaito-border)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {analysisIsLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <BrainCircuit className="h-4 w-4" />
                            )}
                            Run Leaderboard Analysis
                          </motion.button>
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
                                    <td className="px-2 py-1 font-semibold">
                                      {cleanModelName(row.config.model_type)}
                                    </td>
                                    <td className="px-2 py-1 text-[var(--kaito-muted)] dark:text-slate-300">
                                      {row.module_type}
                                    </td>
                                    <td
                                      className={`px-2 py-1 text-right font-mono ${getMetricClass(row.metrics.rmse, batchLeaderboardMins.rmse)}`}
                                    >
                                      {row.metrics.rmse !== null &&
                                      row.metrics.rmse !== undefined &&
                                      !Number.isNaN(row.metrics.rmse as number)
                                        ? Number(row.metrics.rmse).toFixed(2)
                                        : "-"}
                                    </td>
                                    <td
                                      className={`px-2 py-1 text-right font-mono ${getMetricClass(row.metrics.mae, batchLeaderboardMins.mae)}`}
                                    >
                                      {row.metrics.mae !== null &&
                                      row.metrics.mae !== undefined &&
                                      !Number.isNaN(row.metrics.mae as number)
                                        ? Number(row.metrics.mae).toFixed(2)
                                        : "-"}
                                    </td>
                                    <td
                                      className={`px-2 py-1 text-right font-mono ${getMetricClass(row.metrics.mape, batchLeaderboardMins.mape)}`}
                                    >
                                      {row.metrics.mape !== null &&
                                      row.metrics.mape !== undefined &&
                                      !Number.isNaN(row.metrics.mape as number)
                                        ? Number(row.metrics.mape).toFixed(2)
                                        : "-"}
                                    </td>
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
                                      {cleanModelName(row.config.model_type)}
                                    </td>
                                    <td
                                      className={`px-2 py-1 text-right font-mono ${getMetricClass(row.aggregate.rmse, backtestAggregateMins.rmse)}`}
                                    >
                                      {row.aggregate.rmse !== null &&
                                      row.aggregate.rmse !== undefined &&
                                      !Number.isNaN(row.aggregate.rmse as number)
                                        ? Number(row.aggregate.rmse).toFixed(2)
                                        : "-"}
                                    </td>
                                    <td
                                      className={`px-2 py-1 text-right font-mono ${getMetricClass(row.aggregate.mae, backtestAggregateMins.mae)}`}
                                    >
                                      {row.aggregate.mae !== null &&
                                      row.aggregate.mae !== undefined &&
                                      !Number.isNaN(row.aggregate.mae as number)
                                        ? Number(row.aggregate.mae).toFixed(2)
                                        : "-"}
                                    </td>
                                    <td
                                      className={`px-2 py-1 text-right font-mono ${getMetricClass(row.aggregate.mape, backtestAggregateMins.mape)}`}
                                    >
                                      {row.aggregate.mape !== null &&
                                      row.aggregate.mape !== undefined &&
                                      !Number.isNaN(row.aggregate.mape as number)
                                        ? Number(row.aggregate.mape).toFixed(2)
                                        : "-"}
                                    </td>
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
                            <motion.button
                              type="button"
                              onClick={refreshSavedConfigs}
                              whileHover={{ y: -2, scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                              transition={hoverSpring}
                              className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--kaito-muted)] transition hover:text-[var(--kaito-ink)]"
                            >
                              Refresh
                            </motion.button>
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
                                    <motion.button
                                      type="button"
                                      onClick={() => handleLoadSavedConfig(item.id)}
                                      whileHover={{ y: -2, scale: 1.01 }}
                                      whileTap={{ scale: 0.99 }}
                                      transition={hoverSpring}
                                      className="rounded-full border border-[var(--kaito-border)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
                                    >
                                      Load
                                    </motion.button>
                                    <motion.button
                                      type="button"
                                      onClick={() => handleDeleteSavedConfig(item.id)}
                                      whileHover={{ y: -2, scale: 1.01 }}
                                      whileTap={{ scale: 0.99 }}
                                      transition={hoverSpring}
                                      className="rounded-full border border-[var(--kaito-border)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--kaito-ink)] transition hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
                                    >
                                      Delete
                                    </motion.button>
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
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </motion.main>
    </PageWrapper>
  </div>
);
};

export default App;

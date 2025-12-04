import { useEffect, useMemo, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import {
  Area,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fluidEase } from "./PageWrapper";
import type { ForecastMetrics, ForecastRun, TimeSeriesRecord } from "../types";
import { formatModelName } from "../utils/modelNames";

interface ForecastChartProps {
  history?: TimeSeriesRecord[];
  forecasts?: ForecastRun[];
  testSet?: TimeSeriesRecord[];
  accentColor?: string;
  secondaryColor?: string;
  warmColor?: string;
  metrics?: ForecastMetrics | null;
  modelLabel?: string;
  runDurationMs?: number | null;
  loading?: boolean;
  onQuickStart?: () => void;
  quickLabel?: string;
  lowerBoundKey?: string;
  upperBoundKey?: string;
}

type ChartPoint = {
  ds: string;
  xValue: number;
  actual?: number;
  testActual?: number;
  trainPrediction?: number;
} & Record<string, number | [number, number] | string | undefined>;

type DomainValue = number | "dataMin" | "dataMax";

const toDateValue = (value: string) => {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Number.NaN;
};

const hexToRgba = (hex: string, alpha: number) => {
  if (!hex || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
    return `rgba(52, 211, 153, ${alpha})`;
  }
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const int = parseInt(value, 16);
  if (Number.isNaN(int)) return `rgba(52, 211, 153, ${alpha})`;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatLabel = (value?: string | number) => {
  if (value === undefined || value === null) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
};

const FORECAST_COLORS = [
  "#c25b00",
  "#2563eb",
  "#16a34a",
  "#d946ef",
  "#0891b2",
  "#f97316",
  "#a855f7",
  "#f43f5e",
];

type ForecastLine = {
  run: ForecastRun;
  dataKey: string;
  color: string;
  label: string;
};

type ConfidenceBand = {
  level: number;
  lowerKey: string;
  upperKey: string;
  rangeKey: string;
};

const formatMetric = (value?: number | null) =>
  value === null || value === undefined || Number.isNaN(value) ? "-" : value.toFixed(2);

export const ForecastChart = ({
  history = [],
  forecasts = [],
  testSet = [],
  accentColor: _accentColor,
  secondaryColor: _secondaryColor,
  warmColor,
  metrics,
  modelLabel,
  runDurationMs,
  loading,
  onQuickStart,
  quickLabel,
  lowerBoundKey,
  upperBoundKey,
}: ForecastChartProps) => {
  const [controlsOpen, setControlsOpen] = useState(false);
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>({});
  const [hoveredPoint, setHoveredPoint] = useState<{
    label: string | number;
    point: ChartPoint | null;
  } | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [left, setLeft] = useState<DomainValue>("dataMin");
  const [right, setRight] = useState<DomainValue>("dataMax");
  const isSeriesVisible = (key: string) => visibleSeries[key] !== false;
  const forecastSeries = useMemo<ForecastLine[]>(() => {
    const palette = FORECAST_COLORS;
    return (forecasts ?? []).map((run, idx) => {
      const safeId = (run.runId || `run-${idx}`).replace(/[^a-zA-Z0-9_]/g, "_");
      return {
        run,
        dataKey: `forecast_${safeId}`,
        color: palette[idx % palette.length],
        label: formatModelName(run.config.module_type, run.config.model_type),
      };
    });
  }, [forecasts]);
  const primarySeries = forecastSeries[forecastSeries.length - 1] ?? null;
  const primaryForecast = primarySeries?.run ?? null;
  const primaryDataKey = primarySeries?.dataKey ?? "forecast_primary";
  const bandSourceSeries = useMemo(() => {
    const visibleStats =
      forecastSeries
        .slice()
        .reverse()
        .find(
          (series) =>
            isSeriesVisible(series.dataKey) &&
            series.run.config.module_type === "StatsForecast" &&
            (series.run.bounds?.length ?? 0) > 0,
        ) ?? null;
    if (visibleStats) return visibleStats;
    return (
      forecastSeries
        .slice()
        .reverse()
        .find(
          (series) =>
            series.run.config.module_type === "StatsForecast" &&
            (series.run.bounds?.length ?? 0) > 0,
        ) ?? null
    );
  }, [forecastSeries, visibleSeries]);
  const bandForecast = bandSourceSeries?.run ?? null;
  const primaryStroke = primarySeries?.color ?? _accentColor ?? "#c25b00";
  const bandsVisible = bandSourceSeries ? isSeriesVisible(bandSourceSeries.dataKey) : false;
  const showBands = Boolean(bandForecast) && bandsVisible;
  const intervalLevels = useMemo(
    () => bandForecast?.bounds?.map((b) => b.level)?.sort((a, b) => a - b) ?? [],
    [bandForecast],
  );
  const bandDescriptors = useMemo<ConfidenceBand[]>(() => {
    if (!showBands || !bandForecast) return [];
    if (lowerBoundKey && upperBoundKey) {
      const baseLevel = intervalLevels[intervalLevels.length - 1] ?? intervalLevels[0] ?? 0;
      return [
        {
          level: baseLevel,
          lowerKey: lowerBoundKey,
          upperKey: upperBoundKey,
          rangeKey: `${lowerBoundKey}__${upperBoundKey}__range`,
        },
      ];
    }
    return intervalLevels.map((lvl) => ({
      level: lvl,
      lowerKey: `lower_${lvl}`,
      upperKey: `upper_${lvl}`,
      rangeKey: `range_${lvl}`,
    }));
  }, [bandForecast, intervalLevels, lowerBoundKey, showBands, upperBoundKey]);
  const bandLevels = showBands
    ? bandDescriptors.length
      ? bandDescriptors.map((band) => band.level)
      : intervalLevels
    : [];
  const boundsMap = useMemo(() => {
    const map = new Map<number, { lower: number[]; upper: number[] }>();
    bandForecast?.bounds?.forEach((interval) =>
      map.set(interval.level, { lower: interval.lower, upper: interval.upper }),
    );
    return map;
  }, [bandForecast]);
  const noiseId = useMemo(() => `chartNoise-${Math.random().toString(36).slice(2, 7)}`, []);
  const moduleBadge = primaryForecast
    ? formatModelName(primaryForecast.config.module_type, primaryForecast.config.model_type)
    : "Awaiting run";
  const testSplitBadge =
    primaryForecast?.config.test_size_fraction && primaryForecast.config.test_size_fraction > 0
      ? `${Math.round(primaryForecast.config.test_size_fraction * 100)}% test split`
      : "No test split";

  const fittedMap = useMemo(() => {
    const map = new Map<string, number>();
    const fitted = primaryForecast?.fitted;
    if (!fitted) return map;
    fitted.timestamps.forEach((ts, idx) => {
      const value = fitted.forecast[idx];
      if (Number.isFinite(value)) {
        map.set(ts, value);
      }
    });
    return map;
  }, [primaryForecast?.fitted]);

  const { data, xLabelLookup } = useMemo(() => {
    const trainCount = history.length - testSet.length;
    const timestampsOrder: string[] = [];
    const pushTs = (ts: string) => {
      if (!timestampsOrder.includes(ts)) {
        timestampsOrder.push(ts);
      }
    };

    history.forEach((row) => pushTs(row.ds));
    forecastSeries.forEach((series) => series.run.timestamps.forEach((ts) => pushTs(ts)));
    fittedMap.forEach((_, ts) => pushTs(ts));

    const sortedTimestamps = [...timestampsOrder].sort((a, b) => {
      const da = toDateValue(a);
      const db = toDateValue(b);
      if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
      return timestampsOrder.indexOf(a) - timestampsOrder.indexOf(b);
    });

    const actualMap = new Map<string, number>();
    const testActualMap = new Map<string, number>();
    history.forEach((row, idx) => {
      if (idx < trainCount) {
        actualMap.set(row.ds, row.y);
      } else {
        testActualMap.set(row.ds, row.y);
      }
    });

    const forecastMaps = new Map<string, Map<string, number>>();
    forecastSeries.forEach((series) => {
      const map = new Map<string, number>();
      series.run.timestamps.forEach((ts, idx) => {
        const value = series.run.forecast[idx];
        map.set(ts, value);
      });
      forecastMaps.set(series.dataKey, map);
    });

    const labelLookup = new Map<number, string>();

    const chartPoints = sortedTimestamps.map((ts, idx) => {
      const tsValue = toDateValue(ts);
      const xValue = Number.isFinite(tsValue) ? tsValue : idx;
      labelLookup.set(xValue, ts);

      const point: ChartPoint = { ds: ts, xValue };
      if (actualMap.has(ts)) point.actual = actualMap.get(ts);
      if (testActualMap.has(ts)) point.testActual = testActualMap.get(ts);
      if (fittedMap.has(ts)) point.trainPrediction = fittedMap.get(ts);

      forecastMaps.forEach((map, key) => {
        const value = map.get(ts);
        if (value !== undefined) point[key] = value;
      });

      if (bandForecast && bandDescriptors.length) {
        const tsIdx = bandForecast.timestamps.findIndex((t) => t === ts);
        if (tsIdx >= 0) {
          bandDescriptors.forEach((band) => {
            const bounds = boundsMap.get(band.level);
            if (bounds) {
              const lower = bounds.lower[tsIdx];
              const upper = bounds.upper[tsIdx];
              point[band.rangeKey] = [lower, upper];
            }
          });
        }
      }

      return point;
    });

    return { data: chartPoints, xLabelLookup: labelLookup };
  }, [bandDescriptors, bandForecast, boundsMap, forecastSeries, fittedMap, history, testSet]);

  const toggleOptions = useMemo(
    () => [
      { key: "train", label: "Train actuals", available: data.length > 0 },
      { key: "test", label: "Test actuals", available: testSet.length > 0 },
      { key: "fit", label: "Train fit", available: Boolean(primaryForecast?.fitted) },
      ...forecastSeries.map((series) => ({
        key: series.dataKey,
        label: series.label,
        available: true,
      })),
    ],
    [data.length, forecastSeries, primaryForecast?.fitted, testSet.length],
  );
  useEffect(() => {
    setVisibleSeries((prev) => {
      const next = { ...prev };
      let changed = false;
      const keys = toggleOptions.filter((t) => t.available).map((t) => t.key);
      keys.forEach((key) => {
        if (next[key] === undefined) {
          next[key] = true;
          changed = true;
        }
      });
      Object.keys(next).forEach((key) => {
        if (!keys.includes(key)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [toggleOptions]);
  const colorSet = useMemo(() => {
    const trainStroke = "#222";
    const testStroke = warmColor ?? _secondaryColor ?? "#524b41";
    const fitStroke = "#8c7968";
    const bandBase =
      bandSourceSeries?.color ?? primaryStroke ?? "#c25b00";
    const bandWash = hexToRgba(bandBase, 0.2);
    return {
      train: trainStroke,
      test: testStroke,
      fit: fitStroke,
      bandOutline: bandBase,
      bandWash,
    };
  }, [bandSourceSeries?.color, primaryStroke, warmColor, _secondaryColor]);
  const bandFillFor = (level: number) => {
    // Make tighter intervals (e.g., 50%) slightly stronger than wide ones (e.g., 95%)
    // so they stay visible even when bands overlap.
    const opacity = level < 80 ? 0.45 : 0.3;
    return hexToRgba(colorSet.bandOutline, opacity);
  };
  const tooltipNameMap = useMemo(() => {
    const map = new Map<string, string>([
      ["actual", "Train"],
      ["testActual", "Test"],
      ["trainPrediction", "Train fit"],
    ]);
    forecastSeries.forEach((series) => {
      map.set(series.dataKey, series.label);
    });
    bandDescriptors.forEach((band) => {
      map.set(band.rangeKey, `Band ${band.level}%`);
    });
    return map;
  }, [forecastSeries, bandDescriptors]);
  const renderTooltipContent = (props: any) => {
    const { active, payload, label } = props;
    if (!active || !payload?.length) return null;

    // Keep the last occurrence of each dataKey to avoid duplicates (e.g., line + area of same series).
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (let i = payload.length - 1; i >= 0; i -= 1) {
      const item = payload[i];
      const key = (item?.dataKey ?? item?.name) as string;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.unshift(item);
    }

    return (
      <div className="rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-md dark:border-slate-700 dark:bg-slate-900/95">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {formatLabel(typeof label === "number" ? xLabelLookup.get(label) ?? label : label)}
        </div>
        <div className="space-y-1">
          {deduped.map((entry) => {
            const key = (entry?.dataKey ?? entry?.name) as string;
            const display = tooltipNameMap.get(key) ?? key;
            const val = Array.isArray(entry?.value)
              ? entry.value
                  .map((v: any) => (typeof v === "number" ? v.toFixed(2) : v))
                  .join(" - ")
              : typeof entry?.value === "number"
                ? entry.value.toFixed(2)
                : entry?.value;
            return (
              <div key={key} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: entry?.color ?? "#888" }}
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-300">{display}</span>
                </div>
                <span className="font-mono text-xs text-slate-800 dark:text-slate-100">{val}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const handleMouseMove = (state: any) => {
    const activeLabel = state?.activeLabel as number | undefined;
    if (refAreaLeft !== null && typeof activeLabel === "number") {
      setRefAreaRight(activeLabel);
    }
    const point = state?.activePayload?.[0]?.payload as ChartPoint | undefined;
    const label = state?.activeLabel as string | number | undefined;
    if (!point || label === undefined || label === null) {
      setHoveredPoint(null);
      return;
    }
    const displayLabel =
      typeof label === "number" ? xLabelLookup.get(label) ?? label : label;
    setHoveredPoint({ label: displayLabel, point });
  };
  const handleMouseDown = (state: any) => {
    const label = state?.activeLabel;
    if (typeof label !== "number") return;
    setRefAreaLeft(label);
    setRefAreaRight(label);
  };
  const handleMouseUp = () => {
    if (refAreaLeft === null || refAreaRight === null) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }
    if (refAreaLeft === refAreaRight) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }
    const [from, to] = refAreaLeft < refAreaRight ? [refAreaLeft, refAreaRight] : [refAreaRight, refAreaLeft];
    setLeft(from);
    setRight(to);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };
  const resetZoom = () => {
    setLeft("dataMin");
    setRight("dataMax");
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };
  const isZoomed = left !== "dataMin" || right !== "dataMax";
  const formatXTick = (value: number | string) =>
    typeof value === "number" ? formatLabel(xLabelLookup.get(value) ?? value) : formatLabel(value);
  const hudRows = useMemo(
    () => {
      if (!hoveredPoint?.point) return [];
      const point = hoveredPoint.point;
      const rows: { key: string; label: string; value: string; color?: string }[] = [];
      if (typeof point.actual === "number" && isSeriesVisible("train")) {
        rows.push({ key: "train", label: "Train", value: point.actual.toFixed(2), color: colorSet.train });
      }
      if (typeof point.testActual === "number" && isSeriesVisible("test")) {
        rows.push({
          key: "test",
          label: "Test",
          value: point.testActual.toFixed(2),
          color: colorSet.test,
        });
      }
      if (typeof point.trainPrediction === "number" && isSeriesVisible("fit")) {
        rows.push({
          key: "fit",
          label: "Train fit",
          value: point.trainPrediction.toFixed(2),
          color: colorSet.fit,
        });
      }
      forecastSeries.forEach((series) => {
        const value = point[series.dataKey];
        if (typeof value === "number" && isSeriesVisible(series.dataKey)) {
          rows.push({
            key: series.dataKey,
            label: series.label,
            value: value.toFixed(2),
            color: series.color,
          });
        }
      });
      return rows;
    },
    [hoveredPoint, forecastSeries, colorSet],
  );
  const hudLabel = hoveredPoint ? formatLabel(hoveredPoint.label) : null;

  const strokeFor = (key: string, color: string) => color;
  const opacityFor = (key: string) => (isSeriesVisible(key) ? 1 : 0.25);
  const isHidden = (key: string) => !isSeriesVisible(key);
  const toggleSeriesVisibility = (key: string) =>
    setVisibleSeries((prev) => {
      const next = { ...prev };
      const currentlyVisible = prev[key] !== false;
      next[key] = !currentlyVisible;
      return next;
    });
  const availableToggleKeys = toggleOptions.filter((t) => t.available).map((t) => t.key);
  const toggleAllVisible = availableToggleKeys.some((key) => !isSeriesVisible(key));
  const toggleAll = () => {
    setVisibleSeries((prev) => {
      const next = { ...prev };
      availableToggleKeys.forEach((key) => {
        next[key] = toggleAllVisible;
      });
      return next;
    });
  };
  const hasData = data.length > 0;
  const tickerItems = [
    { label: "Model", value: modelLabel ?? "-" },
    { label: "MAE", value: formatMetric(metrics?.mae) },
    { label: "RMSE", value: formatMetric(metrics?.rmse) },
    { label: "Time", value: runDurationMs ? `${(runDurationMs / 1000).toFixed(1)}s` : "-" },
  ];
  const showSkeleton = loading && history.length === 0 && forecastSeries.length === 0;
  const chartRevealKey = `${primarySeries?.dataKey ?? "chart"}-${data.length}-${loading ? "loading" : "ready"}`;
  const hoverSpring = { type: "spring", stiffness: 420, damping: 20 };
  const referenceReady = refAreaLeft !== null && refAreaRight !== null;

  useEffect(() => {
    setLeft("dataMin");
    setRight("dataMax");
    setRefAreaLeft(null);
    setRefAreaRight(null);
  }, [chartRevealKey]);

  return (
    <div className="timeline-card panel relative box-border min-h-[520px] p-6" aria-busy={loading}>
      {loading ? (
        <div className="scanline absolute inset-x-0 top-0 h-1 overflow-hidden rounded-t-xl bg-slate-200 dark:bg-slate-800/80">
          <div className="scanline-bar h-full w-1/3" />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="card-title">Timeline</p>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Train, test, and forecast
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="pill border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
            {moduleBadge}
          </span>
          {primaryForecast && (
            <span className="pill border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
              {testSplitBadge}
            </span>
          )}
          {testSet.length > 0 && (
            <span className="pill border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
              {testSet.length} test points
            </span>
          )}
          {primaryForecast?.config.log_transform && (
            <span className="pill border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
              log1p
            </span>
          )}
          {bandLevels.length > 0 && (
            <span className="pill border-amber-300 bg-amber-50 text-amber-700 shadow-sm shadow-amber-500/10 dark:border-amber-400/60 dark:bg-amber-500/10 dark:text-amber-100">
              Bands: {bandLevels.join("% / ")}%
            </span>
          )}
          <motion.button
            type="button"
            onClick={resetZoom}
            disabled={!isZoomed}
            whileHover={{ y: -2, scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            transition={hoverSpring}
            className="pill border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-100 dark:hover:border-indigo-400/70 dark:hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset Zoom
          </motion.button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#4a473f] dark:text-slate-300">
        {tickerItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 rounded-full border border-[#c0b2a3] bg-[var(--kaito-surface)] px-3 py-1 shadow-sm shadow-black/5 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none"
          >
            <span className="text-[10px] text-[#6a655b] dark:text-slate-400">{item.label}</span>
            <span className="font-mono text-xs text-[#2f2a24] dark:text-slate-100">
              {item.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-[#c0b2a3] bg-[var(--kaito-surface)]/60 p-3 shadow-sm shadow-black/5 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
        <button
          type="button"
          onClick={() => setControlsOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-[#4a473f] transition hover:text-[#c25b00] dark:text-slate-200"
        >
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c25b00]" />
            Series controls
          </span>
          <span className="flex items-center gap-2 text-[11px] text-[#6a655b] dark:text-slate-400">
            {controlsOpen ? "Hide" : "Show"}
            <motion.span
              animate={{ rotate: controlsOpen ? 180 : 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="inline-block"
            >
              v
            </motion.span>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {controlsOpen ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-3">
                <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6a655b] dark:text-slate-400">
                  <span className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-[#c25b00]" />
                    Visibility
                  </span>
                  <motion.button
                    type="button"
                    onClick={toggleAll}
                    disabled={availableToggleKeys.length === 0}
                    whileHover={{ y: -2, scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    transition={hoverSpring}
                    className="rounded-full border border-[#c0b2a3] bg-[var(--kaito-surface)] px-3 py-1 text-[11px] font-semibold text-[#4a473f] shadow-sm transition hover:border-[#c25b00] hover:text-[#c25b00] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:text-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {toggleAllVisible ? "Show all" : "Hide all"}
                  </motion.button>
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {toggleOptions
                      .filter((option) => option.available)
                      .map(({ key, label }) => {
                        const active = isSeriesVisible(key);
                        return (
                          <motion.button
                            key={key}
                            type="button"
                            onClick={() => toggleSeriesVisibility(key)}
                            whileHover={{ y: -2, scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            transition={hoverSpring}
                            className={`rounded-full border px-3 py-1 font-semibold transition ${
                              active
                                ? "border-[#c25b00] bg-[#f2e8de] text-[#c25b00] shadow-sm dark:border-indigo-500/70 dark:bg-indigo-500/10 dark:text-indigo-100"
                                : "border-[#c0b2a3] bg-[var(--kaito-surface)] text-[#7d7368] hover:border-[#c25b00] hover:text-[#c25b00] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500 dark:hover:border-indigo-400 dark:hover:text-indigo-100"
                            }`}
                          >
                            {active ? `On: ${label}` : `Off: ${label}`}
                          </motion.button>
                        );
                      })}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-700 dark:text-slate-200">
        {[
          {
            key: "train",
            label: "Train actuals",
            color: colorSet.train,
            hidden: data.length === 0,
          },
          {
            key: "test",
            label: "Test actuals",
            color: colorSet.test,
            hidden: testSet.length === 0,
          },
          {
            key: "fit",
            label: "Train fit",
            color: colorSet.fit,
            hidden: !primaryForecast?.fitted,
          },
          ...forecastSeries.map((series) => ({
            key: series.dataKey,
            label: series.label,
            color: series.color,
            hidden: false,
          })),
        ]
          .filter(({ hidden }) => !hidden)
          .map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full shadow-[0_0_0_4px_rgba(15,23,42,0.05)] dark:shadow-[0_0_0_4px_rgba(255,255,255,0.06)]"
                style={{ backgroundColor: strokeFor(key, color), opacity: opacityFor(key) }}
              />
              <span className={!isSeriesVisible(key) ? "text-slate-400 dark:text-slate-500" : ""}>
                {label}
              </span>
            </div>
          ))}
      </div>

      <div className="timeline-chart relative mt-4 box-border min-h-[400px] w-full pr-6">
        {showSkeleton ? (
          <div className="chart-skeleton pointer-events-none absolute inset-0 z-10 rounded-xl">
            <div className="absolute inset-3 flex flex-col justify-between gap-4">
              <div className="skeleton-plot rounded-xl" />
              <div className="grid grid-cols-4 gap-2">
                {[55, 38, 70, 48].map((width, idx) => (
                  <div
                    key={width + idx}
                    className="skeleton-bar h-2.5 rounded-full"
                    style={{ width: `${width}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {hasData ? (
          <div className="relative h-full">
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={data}
                margin={{ top: 10, right: 24, left: 0, bottom: 40 }}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                  setHoveredPoint(null);
                  setRefAreaLeft(null);
                  setRefAreaRight(null);
                }}
              >
                <defs>
                  <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={primaryStroke} stopOpacity={0.28} />
                    <stop offset="50%" stopColor={primaryStroke} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={primaryStroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#b0a899" strokeOpacity={0.45} />
                <XAxis
                  dataKey="xValue"
                  tickFormatter={formatXTick}
                  tick={{ fill: "#5c564d", fontSize: 11 }}
                  height={40}
                  allowDuplicatedCategory={false}
                  type="number"
                  domain={[left, right]}
                />
                <YAxis tick={{ fill: "#5c564d", fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(value) => formatXTick(value)}
                  content={renderTooltipContent}
                  cursor={{ stroke: "#a8a29e", strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                {referenceReady ? (
                  <ReferenceArea
                    x1={refAreaLeft ?? undefined}
                    x2={refAreaRight ?? undefined}
                    strokeOpacity={0.8}
                    fill={hexToRgba(primaryStroke, 0.25)}
                    fillOpacity={0.3}
                  />
                ) : null}
                {showBands
                  ? bandDescriptors.map((band, idx) => (
                      <Area
                        key={`band-${band.level}-${band.rangeKey}`}
                        type="monotone"
                        dataKey={band.rangeKey}
                        stroke="none"
                        fill={bandFillFor(band.level)}
                        isAnimationActive={!loading}
                        animationDuration={1600 + idx * 140}
                        animationEasing="ease-in-out"
                        legendType="none"
                        connectNulls
                      />
                    ))
                  : null}
                {primarySeries ? (
                  <Area
                    type="monotone"
                    dataKey={primarySeries.dataKey}
                    stroke="none"
                    fill="url(#forecastGradient)"
                    hide={isHidden(primarySeries.dataKey)}
                    fillOpacity={isSeriesVisible(primarySeries.dataKey) ? 0.65 : 0}
                    isAnimationActive={!loading}
                    animationDuration={1600}
                    animationEasing="ease-in-out"
                  />
                ) : null}
                <Brush
                  dataKey="xValue"
                  height={24}
                  stroke="#c25b00"
                  travellerWidth={10}
                  tickFormatter={formatXTick}
                  fill="rgba(194,91,0,0.08)"
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke={strokeFor("train", colorSet.train)}
                  strokeOpacity={opacityFor("train")}
                  hide={isHidden("train")}
                  strokeWidth={1.5}
                  dot={{
                    r: 4.5,
                    stroke: strokeFor("train", colorSet.train),
                    strokeWidth: 1.4,
                    fill: "var(--paper-bg)",
                  }}
                  name="Train actuals"
                  isAnimationActive={!loading}
                  animationDuration={1650}
                  animationEasing="ease-in-out"
                />
                {testSet.length > 0 && (
                  <Line
                  type="monotone"
                  dataKey="testActual"
                  stroke={strokeFor("test", colorSet.test)}
                  strokeOpacity={opacityFor("test")}
                  hide={isHidden("test")}
                  strokeWidth={1.5}
                  dot={{
                    strokeWidth: 1.3,
                    r: 4.3,
                    stroke: strokeFor("test", colorSet.test),
                    fill: "var(--paper-bg)",
                  }}
                  name="Test actuals"
                  isAnimationActive={!loading}
                  animationDuration={1650}
                    animationEasing="ease-in-out"
                  />
                )}
                {primaryForecast?.fitted && (
                  <Line
                  type="monotone"
                  dataKey="trainPrediction"
                  stroke={strokeFor("fit", colorSet.fit)}
                  strokeOpacity={opacityFor("fit")}
                  hide={isHidden("fit")}
                  strokeWidth={1.25}
                  dot={false}
                  name="Train fit"
                  strokeDasharray="3 2"
                  isAnimationActive={!loading}
                    animationDuration={1650}
                    animationEasing="ease-in-out"
                  />
                )}
                {forecastSeries.map((series, idx) => (
                  <Line
                    key={series.dataKey}
                    type="monotone"
                  dataKey={series.dataKey}
                  stroke={strokeFor(series.dataKey, series.color)}
                  strokeOpacity={opacityFor(series.dataKey)}
                  hide={isHidden(series.dataKey)}
                  strokeWidth={series.dataKey === primaryDataKey ? 2.1 : 1.6}
                  dot={false}
                  name={series.label}
                    className={series.dataKey === primaryDataKey ? "line-glow" : undefined}
                    isAnimationActive={!loading}
                    animationDuration={1700 + idx * 90}
                    animationEasing="ease-in-out"
                    strokeLinecap="round"
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <svg
              className="pointer-events-none absolute inset-0 opacity-30"
              aria-hidden
              style={{ mixBlendMode: "multiply" }}
            >
              <filter id={noiseId}>
                <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="2" stitchTiles="stitch">
                  <animate
                    attributeName="baseFrequency"
                    dur="11s"
                    values="0.35;0.6;0.45;0.58;0.4;0.35"
                    repeatCount="indefinite"
                  />
                </feTurbulence>
              </filter>
              <rect width="100%" height="100%" filter={`url(#${noiseId})`} opacity="0.18" />
            </svg>
            {hudRows.length > 0 && hudLabel ? (
              <div className="chart-hud pointer-events-none absolute right-3 top-3 z-20 rounded-xl px-3 py-2 text-xs text-[#2f2a24] dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6a655b] dark:text-slate-400">
                    {hudLabel}
                  </span>
                  <span className="rounded-full bg-[#1f1c19]/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#2f2a24] dark:bg-white/10 dark:text-slate-100">
                    HUD
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {hudRows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-[#1f1c19]/30"
                          style={{ backgroundColor: "transparent", borderColor: row.color ?? "#1f1c19" }}
                        />
                        <span>{row.label}</span>
                      </span>
                      <span className="font-mono text-[13px] text-[#1f1c19] dark:text-slate-100">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <motion.div
              key={chartRevealKey}
              className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-[var(--kaito-bg)] via-[var(--kaito-bg)]/85 to-transparent"
              initial={{ scaleY: 1 }}
              animate={{ scaleY: 0 }}
              transition={{ duration: 1.4, ease: fluidEase }}
              style={{ transformOrigin: "top" }}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <div className="text-center leading-tight">
              <p className="font-semibold text-slate-700 dark:text-slate-100">
                Upload data or load a sample to see the forecast.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                We will run a quick default forecast for you.
              </p>
            </div>
            <motion.button
              type="button"
              onClick={onQuickStart}
              disabled={!onQuickStart}
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              transition={hoverSpring}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-500/50 dark:text-indigo-100 dark:hover:border-indigo-400/70 dark:hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {quickLabel ?? "Try with sample data"}
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
};

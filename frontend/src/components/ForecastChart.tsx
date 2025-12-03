import { useMemo, useState } from "react";

import { motion } from "framer-motion";

import {
  Area,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fluidEase } from "./PageWrapper";
import type { ForecastMetrics, ForecastRun, TimeSeriesRecord } from "../types";

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
  actual?: number;
  testActual?: number;
  trainPrediction?: number;
} & Record<string, number | [number, number] | string | undefined>;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const toDateValue = (value: string) => {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Number.NaN;
};

const hexToRgba = (hex: string, alpha: number) => {
  if (!hex) return `rgba(52, 211, 153, ${alpha})`;
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const int = parseInt(value.slice(0, 6), 16);
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

type ForecastTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartPoint }>;
  label?: string | number;
  bands: ConfidenceBand[];
};

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

const ForecastTooltip = ({
  active,
  payload,
  label,
  bands,
  forecastSeries,
}: ForecastTooltipProps & { forecastSeries: ForecastLine[] }) => {
  if (!active || !payload?.length) return null;
  const point: ChartPoint | undefined = payload[0]?.payload;
  if (!point) return null;
  const forecastRows = forecastSeries
    .map((series) => {
      const value = point?.[series.dataKey] as number | undefined;
      if (value === undefined) return null;
      return { ...series, value };
    })
    .filter(Boolean) as Array<ForecastLine & { value: number }>;

  return (
    <div className="rounded-lg border border-[#c0b2a3] bg-[var(--kaito-surface)] px-3 py-2 shadow-md shadow-black/10 dark:border-slate-800 dark:bg-slate-900/90">
      <p className="text-xs text-[#6a655b] dark:text-slate-400">{formatLabel(label)}</p>
      <div className="mt-1 space-y-1 text-sm text-[#2f2a24] dark:text-slate-100">
        {point.actual !== undefined && (
          <div className="text-[#222] dark:text-blue-300">Actual: {point.actual.toFixed(3)}</div>
        )}
        {point.testActual !== undefined && (
          <div className="text-[#4a473f] dark:text-amber-300">
            Test actual: {point.testActual.toFixed(3)}
          </div>
        )}
        {point.trainPrediction !== undefined && (
          <div className="text-[#6f6458] dark:text-indigo-300">
            Train fit: {point.trainPrediction.toFixed(3)}
          </div>
        )}
        {forecastRows.map((series) => (
          <div
            key={series.dataKey}
            className="flex items-center justify-between gap-2 text-[#c25b00] dark:text-emerald-300"
          >
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: series.color }}
                aria-hidden
              />
              <span className="text-[#2f2a24] dark:text-slate-100">{series.label}</span>
            </span>
            <span className="font-mono text-[#2f2a24] dark:text-slate-100">
              {series.value.toFixed(3)}
            </span>
          </div>
        ))}
        {bands.map((band) => {
          const lower = point[band.lowerKey] as number | undefined;
          const upper = point[band.upperKey] as number | undefined;
          if (typeof lower !== "number" || typeof upper !== "number") return null;
          return (
            <div
              key={`tooltip-${band.level}-${band.lowerKey}-${band.upperKey}`}
              className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400"
            >
              <span>{band.level ? `${band.level}% band` : "Band"}</span>
              <span className="font-mono text-slate-900 dark:text-slate-100">
                {lower.toFixed(3)} - {upper.toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const formatMetric = (value?: number | null) =>
  value === null || value === undefined || Number.isNaN(value) ? "-" : value.toFixed(3);

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
  const [focusedSeries, setFocusedSeries] = useState<string | null>(null);
  const forecastSeries = useMemo<ForecastLine[]>(() => {
    const palette = FORECAST_COLORS;
    return (forecasts ?? []).map((run, idx) => {
      const safeId = (run.runId || `run-${idx}`).replace(/[^a-zA-Z0-9_]/g, "_");
      return {
        run,
        dataKey: `forecast_${safeId}`,
        color: palette[idx % palette.length],
        label: `${run.config.model_type.toUpperCase()} (${run.config.module_type})`,
      };
    });
  }, [forecasts]);
  const primarySeries = forecastSeries[forecastSeries.length - 1] ?? null;
  const primaryForecast = primarySeries?.run ?? null;
  const primaryDataKey = primarySeries?.dataKey ?? "forecast_primary";
  const focusedForecastSeries =
    focusedSeries !== null
      ? forecastSeries.find((series) => series.dataKey === focusedSeries) ?? null
      : null;
  const latestStatsForecastSeries =
    forecastSeries
      .slice()
      .reverse()
      .find(
        (series) =>
          series.run.config.module_type === "StatsForecast" &&
          (series.run.bounds?.length ?? 0) > 0,
      ) ?? null;
  const bandSourceSeries =
    focusedForecastSeries &&
    focusedForecastSeries.run.config.module_type === "StatsForecast" &&
    (focusedForecastSeries.run.bounds?.length ?? 0) > 0
      ? focusedForecastSeries
      : latestStatsForecastSeries;
  const bandForecast = bandSourceSeries?.run ?? null;
  const primaryStroke = primarySeries?.color ?? _accentColor ?? "#c25b00";
  const confidenceAvailable =
    bandForecast?.config.module_type === "StatsForecast" &&
    (bandForecast.bounds?.length ?? 0) > 0;
  const showBands = Boolean(confidenceAvailable && bandSourceSeries);
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
  const bandLevels = bandDescriptors.length ? bandDescriptors.map((band) => band.level) : intervalLevels;
  const boundsMap = useMemo(() => {
    const map = new Map<number, { lower: number[]; upper: number[] }>();
    bandForecast?.bounds?.forEach((interval) =>
      map.set(interval.level, { lower: interval.lower, upper: interval.upper }),
    );
    return map;
  }, [bandForecast]);
  const bandOpacityByLevel = useMemo(() => {
    if (!bandDescriptors.length) return new Map<number, number>();
    const spreads = bandDescriptors.map((band) => {
      const bounds = boundsMap.get(band.level);
      if (!bounds) return { lvl: band.level, spread: 0.1 };
      const widths = bounds.upper.map((value, idx) => Math.abs(value - bounds.lower[idx]));
      const spread = widths.length ? widths.reduce((sum, v) => sum + v, 0) / widths.length : 0.1;
      return { lvl: band.level, spread };
    });
    const maxSpread = spreads.reduce((max, item) => Math.max(max, item.spread), 0.1);
    const mapped = new Map<number, number>();
    spreads.forEach(({ lvl, spread }) => {
      const normalized = clamp(spread / maxSpread, 0, 1);
      const opacity = 0.2 + (1 - normalized) * 0.45;
      mapped.set(lvl, Number(opacity.toFixed(3)));
    });
    return mapped;
  }, [bandDescriptors, boundsMap]);
  const moduleBadge = primaryForecast
    ? `${primaryForecast.config.module_type} / ${primaryForecast.config.model_type.toUpperCase()}`
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

  const data = useMemo<ChartPoint[]>(() => {
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

    return sortedTimestamps.map((ts) => {
      const point: ChartPoint = { ds: ts };
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
              point[band.lowerKey] = lower;
              point[band.upperKey] = upper;
              point[band.rangeKey] = [lower, upper];
            }
          });
        }
      }

      return point;
    });
  }, [
    bandDescriptors,
    bandForecast,
    boundsMap,
    forecastSeries,
    fittedMap,
    history,
    testSet,
  ]);

  const isDimmed = (key: string) => focusedSeries !== null && focusedSeries !== key;
  const colorSet = useMemo(() => {
    const trainStroke = "#222";
    const testStroke = warmColor ?? _secondaryColor ?? "#524b41";
    const fitStroke = "#8c7968";
    const bandBase =
      bandSourceSeries?.color ?? focusedForecastSeries?.color ?? primaryStroke ?? "#c25b00";
    const bandFills = [
      hexToRgba(bandBase, 0.26),
      hexToRgba(bandBase, 0.18),
      hexToRgba(bandBase, 0.12),
    ];
    return {
      train: trainStroke,
      test: testStroke,
      fit: fitStroke,
      bandOutline: bandBase,
      bandFills,
    };
  }, [bandSourceSeries?.color, focusedForecastSeries?.color, primaryStroke, warmColor, _secondaryColor]);

  const strokeFor = (key: string, color: string) => (isDimmed(key) ? "#7d7368" : color);
  const opacityFor = (key: string) => (isDimmed(key) ? 0.35 : 1);
  const hasData = data.length > 0;
  const tickerItems = [
    { label: "Model", value: modelLabel ?? moduleBadge },
    { label: "MAE", value: formatMetric(metrics?.mae) },
    { label: "RMSE", value: formatMetric(metrics?.rmse) },
    { label: "Time", value: runDurationMs ? `${(runDurationMs / 1000).toFixed(1)}s` : "-" },
  ];
  const showSkeleton = loading && history.length === 0 && forecastSeries.length === 0;
  const chartRevealKey = `${primarySeries?.dataKey ?? "chart"}-${data.length}-${loading ? "loading" : "ready"}`;
  const hoverSpring = { type: "spring", stiffness: 420, damping: 20 };

  return (
    <div className="timeline-card panel relative box-border h-[440px] overflow-hidden p-6" aria-busy={loading}>
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
              Bands: {bandLevels.join("% / ")}% (focus to show)
            </span>
          )}
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

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {[
          { key: "train", label: "Train actuals", disabled: data.length === 0 },
          { key: "test", label: "Test actuals", disabled: testSet.length === 0 },
          { key: "fit", label: "Train fit", disabled: !primaryForecast?.fitted },
          ...forecastSeries.map((series) => ({
            key: series.dataKey,
            label: series.label,
            disabled: false,
          })),
        ].map(({ key, label, disabled }) => {
          const active = focusedSeries === key;
          return (
            <motion.button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => setFocusedSeries((prev) => (prev === key ? null : key))}
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              transition={hoverSpring}
              className={`rounded-full border px-3 py-1 font-semibold transition ${
                active
                  ? "border-[#c25b00] bg-[#f2e8de] text-[#c25b00] shadow-sm dark:border-indigo-500/70 dark:bg-indigo-500/10 dark:text-indigo-100"
                  : "border-[#c0b2a3] bg-[var(--kaito-surface)] text-[#4a473f] hover:border-[#c25b00] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {active ? `Focus: ${label}` : `Toggle ${label}`}
            </motion.button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-[#6a655b] dark:text-slate-400">
        Click a forecast to focus and reveal bold confidence bands; drag the mini-map below to zoom the timeline.
      </p>

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
              <span className={isDimmed(key) ? "text-slate-400 dark:text-slate-500" : ""}>
                {label}
              </span>
            </div>
          ))}
      </div>

      <div className="timeline-chart relative mt-4 box-border h-[300px] w-full pr-6">
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
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={primaryStroke} stopOpacity={0.28} />
                    <stop offset="50%" stopColor={primaryStroke} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={primaryStroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#b0a899" strokeOpacity={0.45} />
                <XAxis
                  dataKey="ds"
                  tickFormatter={formatLabel}
                  tick={{ fill: "#5c564d", fontSize: 11 }}
                  height={40}
                  allowDuplicatedCategory={false}
                  type="category"
                />
                <YAxis tick={{ fill: "#5c564d", fontSize: 11 }} />
                <Tooltip
                  labelFormatter={formatLabel}
                  content={(props) => (
                    <ForecastTooltip
                      bands={showBands ? bandDescriptors : []}
                      forecastSeries={forecastSeries}
                      {...props}
                    />
                  )}
                />
                {primarySeries ? (
                  <Area
                    type="monotone"
                    dataKey={primarySeries.dataKey}
                    stroke="none"
                    fill="url(#forecastGradient)"
                    fillOpacity={isDimmed(primarySeries.dataKey) ? 0.25 : 0.65}
                    isAnimationActive={!loading}
                    animationDuration={1600}
                    animationEasing="ease-in-out"
                  />
                ) : null}
                {showBands
                  ? bandDescriptors.map((band, idx) => {
                      const baseOpacity = bandOpacityByLevel.get(band.level) ?? 0.3;
                      const boostedOpacity = Math.min(0.35, Math.max(0.22, baseOpacity));
                      return (
                        <Area
                          key={`band-${band.level}-${band.rangeKey}`}
                          type="monotone"
                          dataKey={band.rangeKey}
                          isRange
                          stroke={colorSet.bandOutline}
                          strokeOpacity={1}
                          strokeWidth={3.2}
                          fill={colorSet.bandFills[idx % colorSet.bandFills.length]}
                          fillOpacity={boostedOpacity}
                          isAnimationActive={!loading}
                          animationDuration={1600 + idx * 140}
                          animationEasing="ease-in-out"
                          legendType="none"
                        />
                      );
                    })
                  : null}
                <Brush
                  dataKey="ds"
                  height={24}
                  stroke="#c25b00"
                  travellerWidth={10}
                  tickFormatter={formatLabel}
                  fill="rgba(194,91,0,0.08)"
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke={strokeFor("train", colorSet.train)}
                  strokeOpacity={opacityFor("train")}
                  strokeWidth={2}
                  dot={false}
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
                    strokeWidth={2}
                    dot={{ strokeWidth: 1.5, r: 2.5, fill: "#0f172a" }}
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
                    strokeWidth={2}
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
                    strokeWidth={series.dataKey === primaryDataKey ? 2.8 : 2}
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

import { useMemo, useState } from "react";

import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
}

type ChartPoint = {
  ds: string;
  actual?: number;
  testActual?: number;
  trainPrediction?: number;
} & Record<string, number | [number, number] | string | undefined>;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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

const sortKeys = (keys: string[]) =>
  keys.sort((a, b) => {
    const da = new Date(a).getTime();
    const db = new Date(b).getTime();
    if (Number.isNaN(da) || Number.isNaN(db)) return a.localeCompare(b);
    return da - db;
  });

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
  intervalLevels: number[];
};

type ForecastLine = {
  run: ForecastRun;
  dataKey: string;
  color: string;
  label: string;
};

const ForecastTooltip = ({
  active,
  payload,
  label,
  intervalLevels,
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
        {intervalLevels.map((lvl) => {
          const lower = point[`lower_${lvl}`] as number | undefined;
          const upper = point[`upper_${lvl}`] as number | undefined;
          if (typeof lower !== "number" || typeof upper !== "number") return null;
          return (
            <div
              key={`tooltip-${lvl}`}
              className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400"
            >
              <span>{lvl}% band</span>
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
  const primaryStroke = primarySeries?.color ?? _accentColor ?? "#c25b00";
  const intervalLevels = useMemo(
    () => primaryForecast?.bounds?.map((b) => b.level)?.sort((a, b) => a - b) ?? [],
    [primaryForecast],
  );
  const boundsMap = useMemo(() => {
    const map = new Map<number, { lower: number[]; upper: number[] }>();
    primaryForecast?.bounds?.forEach((interval) =>
      map.set(interval.level, { lower: interval.lower, upper: interval.upper }),
    );
    return map;
  }, [primaryForecast]);
  const bandOpacityByLevel = useMemo(() => {
    if (!intervalLevels.length) return new Map<number, number>();
    const spreads = intervalLevels.map((lvl) => {
      const bounds = boundsMap.get(lvl);
      if (!bounds) return { lvl, spread: 0.1 };
      const widths = bounds.upper.map((value, idx) => Math.abs(value - bounds.lower[idx]));
      const spread = widths.length ? widths.reduce((sum, v) => sum + v, 0) / widths.length : 0.1;
      return { lvl, spread };
    });
    const maxSpread = spreads.reduce((max, item) => Math.max(max, item.spread), 0.1);
    const mapped = new Map<number, number>();
    spreads.forEach(({ lvl, spread }) => {
      const normalized = clamp(spread / maxSpread, 0, 1);
      const opacity = 0.2 + (1 - normalized) * 0.45;
      mapped.set(lvl, Number(opacity.toFixed(3)));
    });
    return mapped;
  }, [boundsMap, intervalLevels]);
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
    const points = new Map<string, ChartPoint>();

    const ensurePoint = (ds: string) => {
      if (!points.has(ds)) {
        points.set(ds, { ds });
      }
      return points.get(ds)!;
    };

    const testCount = testSet.length;
    const splitIndex = Math.max(history.length - testCount, 0);
    const training = testCount ? history.slice(0, splitIndex) : history;
    const holdout = testCount ? history.slice(splitIndex) : [];

    training.forEach((row) => {
      const point = ensurePoint(row.ds);
      point.actual = row.y;
    });

    holdout.forEach((row) => {
      const point = ensurePoint(row.ds);
      point.testActual = row.y;
    });

    fittedMap.forEach((value, ts) => {
      const point = ensurePoint(ts);
      point.trainPrediction = value;
    });

    forecastSeries.forEach((series) => {
      series.run.timestamps.forEach((ts, idx) => {
        const point = ensurePoint(ts);
        point[series.dataKey] = series.run.forecast[idx];
      });
    });

    if (primaryForecast) {
      primaryForecast.timestamps.forEach((ts, idx) => {
        const point = ensurePoint(ts);
        intervalLevels.forEach((lvl) => {
          const bounds = boundsMap.get(lvl);
          if (bounds) {
            point[`lower_${lvl}`] = bounds.lower[idx];
            point[`upper_${lvl}`] = bounds.upper[idx];
            point[`range_${lvl}`] = [bounds.lower[idx], bounds.upper[idx]];
          }
        });
      });
    }

    const ordered = sortKeys(Array.from(points.keys()));
    return ordered.map((key) => points.get(key)!);
  }, [boundsMap, forecastSeries, fittedMap, history, intervalLevels, primaryForecast, testSet]);

  const isDimmed = (key: string) => focusedSeries !== null && focusedSeries !== key;
  const colorSet = useMemo(() => {
    const trainStroke = "#222";
    const testStroke = warmColor ?? _secondaryColor ?? "#524b41";
    const fitStroke = "#8c7968";
    const bandFill = hexToRgba(primaryStroke, 0.1);
    return {
      train: trainStroke,
      test: testStroke,
      fit: fitStroke,
      bandFills: [bandFill, hexToRgba(primaryStroke, 0.07), hexToRgba(primaryStroke, 0.05)],
    };
  }, [primaryStroke, warmColor, _secondaryColor]);

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
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => setFocusedSeries((prev) => (prev === key ? null : key))}
              className={`rounded-full border px-3 py-1 font-semibold transition ${
                active
                  ? "border-[#c25b00] bg-[#f2e8de] text-[#c25b00] shadow-sm dark:border-indigo-500/70 dark:bg-indigo-500/10 dark:text-indigo-100"
                  : "border-[#c0b2a3] bg-[var(--kaito-surface)] text-[#4a473f] hover:border-[#c25b00] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {active ? `Focus: ${label}` : `Toggle ${label}`}
            </button>
          );
        })}
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
              />
              <YAxis tick={{ fill: "#5c564d", fontSize: 11 }} />
              <Tooltip
                labelFormatter={formatLabel}
                content={(props) => (
                  <ForecastTooltip
                    intervalLevels={intervalLevels}
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
                  animationDuration={1400}
                />
              ) : null}
              {intervalLevels.map((lvl, idx) => (
                <Area
                  key={`band-${lvl}`}
                  type="monotone"
                  dataKey={`range_${lvl}`}
                  isRange
                  stroke="none"
                  fill={colorSet.bandFills[idx % colorSet.bandFills.length]}
                  fillOpacity={
                    isDimmed(primaryDataKey) ? 0.18 : bandOpacityByLevel.get(lvl) ?? 0.32
                  }
                  isAnimationActive={!loading}
                  animationDuration={1000 + idx * 120}
                  legendType="none"
                />
              ))}
              <Line
                type="monotone"
                dataKey="actual"
                stroke={strokeFor("train", colorSet.train)}
                strokeOpacity={opacityFor("train")}
                strokeWidth={2}
                dot={false}
                name="Train actuals"
                isAnimationActive={!loading}
                animationDuration={1200}
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
                  animationDuration={1200}
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
                  animationDuration={1200}
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
                  animationDuration={1400 + idx * 80}
                  strokeLinecap="round"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
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
            <button
              type="button"
              onClick={onQuickStart}
              disabled={!onQuickStart}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-500/50 dark:text-indigo-100 dark:hover:border-indigo-400/70 dark:hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {quickLabel ?? "Try with sample data"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import { Activity, Gauge, Sigma, TrendingDown } from "lucide-react";

import type { ForecastMetrics } from "../types";

interface MetricsCardProps {
  metrics?: ForecastMetrics | null;
}

const formatMetric = (value?: number | null, suffix = "") =>
  value === null || value === undefined || Number.isNaN(value)
    ? "-"
    : `${value.toFixed(3)}${suffix}`;

export const MetricsCard = ({ metrics }: MetricsCardProps) => {
  const items = [
    { label: "MAE", value: formatMetric(metrics?.mae), icon: Activity },
    { label: "RMSE", value: formatMetric(metrics?.rmse), icon: Sigma },
    { label: "MAPE", value: formatMetric(metrics?.mape, "%"), icon: TrendingDown },
  ];

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
        <Gauge className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
        <div>
          <p className="card-title">Metrics</p>
          <h3 className="text-lg font-semibold leading-tight">Holdout quality</h3>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map(({ label, value, icon: Icon }) => (
          <div key={label} className="panel-subtle p-3 text-center shadow-sm">
            <div className="flex items-center justify-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <Icon className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
              <span className="font-semibold">{label}</span>
            </div>
            <p className="mt-1 text-lg font-mono font-semibold text-slate-900 dark:text-slate-100">
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

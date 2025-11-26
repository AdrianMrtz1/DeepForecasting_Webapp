import { useState } from "react";

import { ChevronDown, Database, Loader2, Sparkles } from "lucide-react";

import type { DatasetInfo } from "../types";

interface SampleDatasetPickerProps {
  datasets: DatasetInfo[];
  activeId?: string | null;
  loadingId?: string | null;
  error?: string | null;
  onSelect: (datasetId: string) => void;
}

const formatLabel = (dataset: DatasetInfo) => {
  const pieces: string[] = [];
  if (dataset.freq) pieces.push(dataset.freq);
  if (dataset.season_length) pieces.push(`season ${dataset.season_length}`);
  if (dataset.recommended_horizon) pieces.push(`h${dataset.recommended_horizon}`);
  return pieces.join(" \u2022 ");
};

const badge = (label: string) => (
  <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    {label}
  </span>
);

export const SampleDatasetPicker = ({
  datasets,
  activeId,
  loadingId,
  error,
  onSelect,
}: SampleDatasetPickerProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
          <div>
            <p className="card-title">Sample data</p>
            <h3 className="text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
              Load a bundled dataset
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="pill border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          aria-expanded={open}
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
          {open ? "Hide" : "Browse"}
        </button>
      </div>

      {open ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Skip uploading by pulling a curated dataset with recommended settings. You can still
          upload your own CSV below.
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">Collapsed for a cleaner view.</p>
      )}

      {error && <p className="text-xs text-amber-600 dark:text-amber-300">{error}</p>}

      {open ? (
        datasets.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-100 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
            <Database className="h-4 w-4 text-slate-400" />
            <span>No bundled datasets were returned by the API.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {datasets.map((dataset) => {
              const isActive = dataset.id === activeId;
              const isLoading = dataset.id === loadingId;
              return (
                <div
                  key={dataset.id}
                  className={`panel-subtle border p-3 transition ${
                    isActive
                      ? "border-emerald-400/60 shadow-md shadow-emerald-500/10"
                      : "hover:border-indigo-300/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {dataset.name}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {dataset.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {dataset.recommended_module && badge(dataset.recommended_module)}
                        {dataset.recommended_models?.length
                          ? badge(dataset.recommended_models[0]!.toUpperCase())
                          : null}
                        {formatLabel(dataset) && badge(formatLabel(dataset))}
                        {dataset.rows ? badge(`${dataset.rows} rows`) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelect(dataset.id)}
                      disabled={isLoading}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/40"
                          : "border border-slate-300 bg-white text-slate-800 hover:border-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-indigo-400/60"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {isActive ? "Loaded" : "Use sample"}
                    </button>
                  </div>
                  {dataset.sample?.length ? (
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 text-left text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                          <tr>
                            <th className="px-3 py-1 font-medium">ds</th>
                            <th className="px-3 py-1 text-right font-medium">y</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-slate-900 dark:divide-slate-800 dark:text-slate-100">
                          {dataset.sample.slice(0, 4).map((row, idx) => (
                            <tr key={`${dataset.id}-sample-${idx}`}>
                              <td className="px-3 py-1">{row.ds}</td>
                              <td className="px-3 py-1 text-right font-mono">{row.y}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
};

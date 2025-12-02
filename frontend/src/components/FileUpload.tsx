import { useEffect, useMemo, useState } from "react";

import { ChevronDown, Upload, Wand2 } from "lucide-react";

import type { TimeSeriesRecord } from "../types";

interface FileUploadProps {
  onUpload: (file: File, mapping: { ds: string; y: string }) => Promise<void>;
  loading?: boolean;
  preview?: TimeSeriesRecord[];
  rows?: number;
}

export const FileUpload = ({
  onUpload,
  loading = false,
  preview = [],
  rows = 0,
}: FileUploadProps) => {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [dsCol, setDsCol] = useState<string>("");
  const [yCol, setYCol] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (file || preview.length) {
      setOpen(true);
    }
  }, [file, preview.length]);

  const normalizeColumns = (cells: string[]) =>
    cells.map((cell, idx) => {
      const trimmed = cell.trim();
      return trimmed.length ? trimmed : `Unnamed: ${idx}`;
    });

  const guessTimestamp = (cols: string[]) => {
    const lower = cols.map((c) => c.toLowerCase());
    const candidates = [
      "ds",
      "date",
      "datetime",
      "timestamp",
      "month",
      "quarter",
      "period",
      "time",
      "unnamed: 0",
    ];
    for (const candidate of candidates) {
      const idx = lower.indexOf(candidate);
      if (idx !== -1) return cols[idx];
    }
    return cols[0] ?? "";
  };

  const guessTarget = (cols: string[], dsGuess: string) => {
    const lower = cols.map((c) => c.toLowerCase());
    const candidates = [
      "y",
      "value",
      "target",
      "passengers",
      "sales",
      "volume",
      "count",
      "realgdp",
    ];
    for (const candidate of candidates) {
      const idx = lower.indexOf(candidate);
      if (idx !== -1 && cols[idx] !== dsGuess) return cols[idx];
    }
    return cols.find((c) => c !== dsGuess) ?? cols[1] ?? "";
  };

  const parseHeader = (text: string) => {
    const firstLine = text.split(/\r?\n/).find((line) => line.trim().length);
    if (!firstLine) return [];
    return normalizeColumns(firstLine.split(","));
  };

  const extractColumns = async (file: File): Promise<string[]> => {
    if (typeof file.text === "function") {
      const text = await file.text();
      return parseHeader(text);
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(parseHeader(String(reader.result ?? "")));
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
      reader.readAsText(file);
    });
  };

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const cols = await extractColumns(file);
      if (cols.length < 2) {
        setLocalError("Need at least two columns to map timestamp and target.");
        return;
      }
      const dsGuess = guessTimestamp(cols);
      const yGuess = guessTarget(cols, dsGuess);
      setColumns(cols);
      setDsCol(dsGuess);
      setYCol(yGuess);
      setFile(file);
      setLocalError(null);
    } catch (err) {
      console.warn("Failed to read file columns", err);
      setLocalError("Unable to read that file. Please try another CSV.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!dsCol || !yCol) {
      setLocalError("Select both timestamp and target columns.");
      return;
    }
    setLocalError(null);
    await onUpload(file, { ds: dsCol, y: yCol });
  };

  const columnOptions = useMemo(
    () =>
      columns.map((col) => (
        <option key={col} value={col}>
          {col}
        </option>
      )),
    [columns],
  );

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="card-title">Upload CSV</p>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Bring your time-series
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="pill border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            aria-expanded={open}
          >
            <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
            {open ? "Hide" : "Expand"}
          </button>
          <Wand2 className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
        </div>
      </div>

      {!open ? (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Collapsed for breathing room. Expand to upload or drag in a CSV.
        </p>
      ) : (
        <>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition ${
            dragging
              ? "border-[var(--kaito-accent)] bg-[var(--kaito-subtle)] dark:border-indigo-400/70 dark:bg-indigo-950/30"
              : "border-[var(--kaito-border)] bg-[var(--kaito-surface)] hover:border-[var(--kaito-accent)]/70 dark:border-slate-700 dark:bg-slate-900/60"
          }`}
        >
          <Upload className="h-6 w-6 text-[var(--kaito-ink)] dark:text-indigo-400" />
          <div>
            <p className="font-medium text-[var(--kaito-ink)] dark:text-slate-100">Drop a CSV here</p>
            <p className="text-sm text-[var(--kaito-muted)] dark:text-slate-400">
              Map your timestamp and target columns after selecting a file.
            </p>
          </div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
              aria-label="Upload CSV file"
            />
          <span className="rounded-full bg-[var(--kaito-subtle)] px-3 py-1 text-xs font-semibold text-[var(--kaito-ink)] dark:bg-slate-800 dark:text-slate-200">
            {loading ? "Working..." : "Click to choose a file"}
          </span>
        </label>

        {file && (
          <div className="space-y-3 rounded-xl border border-[var(--kaito-border)] bg-[var(--kaito-surface)] p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between text-sm text-[var(--kaito-muted)] dark:text-slate-200">
              <span className="font-medium">Column mapping</span>
              <span className="text-xs text-[var(--kaito-muted)] dark:text-slate-400">{file.name}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-[var(--kaito-ink)] dark:text-slate-200">
                <span className="mb-1 block text-xs uppercase tracking-[0.04em] text-[var(--kaito-muted)] dark:text-slate-400">
                  Timestamp column
                </span>
                <select
                  className="w-full rounded-lg border border-[var(--kaito-border)] bg-[var(--kaito-surface)] px-3 py-2 text-[var(--kaito-ink)] focus:border-[var(--kaito-accent)] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  value={dsCol}
                  onChange={(e) => setDsCol(e.target.value)}
                >
                  {columnOptions}
                </select>
              </label>
              <label className="text-sm text-[var(--kaito-ink)] dark:text-slate-200">
                <span className="mb-1 block text-xs uppercase tracking-[0.04em] text-[var(--kaito-muted)] dark:text-slate-400">
                  Target column
                </span>
                <select
                  className="w-full rounded-lg border border-[var(--kaito-border)] bg-[var(--kaito-surface)] px-3 py-2 text-[var(--kaito-ink)] focus:border-[var(--kaito-accent)] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  value={yCol}
                  onChange={(e) => setYCol(e.target.value)}
                >
                  {columnOptions}
                </select>
                </label>
              </div>
              {localError && (
                <p className="text-xs text-rose-600 dark:text-rose-300">{localError}</p>
              )}
              <button
                type="button"
                onClick={handleUpload}
                disabled={loading}
                className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Uploading..." : "Validate & upload"}
              </button>
            </div>
          )}

            <div className="flex items-center justify-between text-sm text-[var(--kaito-muted)] dark:text-slate-400">
              <span>Rows detected</span>
              <span className="font-semibold text-[var(--kaito-ink)] dark:text-slate-100">{rows || "-"}</span>
            </div>

            <div className="rounded-xl border border-[var(--kaito-border)] bg-[var(--kaito-surface)] p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--kaito-ink)] dark:text-slate-100">Preview</p>
                <span className="text-xs text-[var(--kaito-muted)] dark:text-slate-400">first 5 rows</span>
              </div>
              {preview.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--kaito-muted)] dark:text-slate-400">
                  Upload a CSV to see a preview.
                </p>
              ) : (
              <div className="mt-3 max-h-48 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="py-1 pr-4 font-medium">ds</th>
                      <th className="py-1 text-right font-medium">y</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-900 dark:divide-slate-800 dark:text-slate-100">
                    {preview.map((row, idx) => (
                      <tr key={`${row.ds}-${idx}`}>
                        <td className="py-1 pr-4">{row.ds}</td>
                        <td className="py-1 text-right font-mono">{row.y}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

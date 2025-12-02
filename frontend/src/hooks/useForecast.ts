import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MODEL_OPTIONS } from "../constants/models";
import type {
  DatasetDetailResponse,
  DatasetInfo,
  DatasetsResponse,
  BacktestResponse,
  BatchForecastResponse,
  ForecastConfigState,
  ForecastResult,
  SavedConfig,
  SavedConfigsResponse,
  TimeSeriesRecord,
  UploadPreview,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:9000";

const defaultConfig: ForecastConfigState = {
  module_type: "StatsForecast",
  model_type: "auto_arima",
  strategy: "multi_step_recursive",
  freq: "D",
  season_length: 7,
  horizon: 12,
  level: [80, 90],
  log_transform: false,
  test_size_fraction: 0.2,
  detect_frequency: true,
  missing_strategy: "none",
  date_start: null,
  date_end: null,
};

type LoadingState = "idle" | "upload" | "forecast" | "benchmark" | "backtest" | "configs";
type DataSource = "upload" | "sample" | null;

type ColumnMapping = { ds: string; y: string };

const sanitizeConfig = (config: ForecastConfigState): ForecastConfigState => {
  const normalizedLevels = Array.from(new Set(config.level.map((lvl) => Number(lvl)))).filter(
    (lvl) => !Number.isNaN(lvl),
  );
  const sortedLevels = normalizedLevels.length ? normalizedLevels.sort((a, b) => a - b) : [80, 90];

  const allowedModels = MODEL_OPTIONS[config.module_type] ?? [];
  const fallbackModel = allowedModels[0] ?? config.model_type;
  const safeModel = allowedModels.includes(config.model_type) ? config.model_type : fallbackModel;

  const supportsDirect = config.module_type !== "StatsForecast";
  const safeStrategy: ForecastConfigState["strategy"] =
    config.strategy === "multi_output_direct" && !supportsDirect
      ? "multi_step_recursive"
      : config.strategy;

  const fractionValue =
    typeof config.test_size_fraction === "number" ? config.test_size_fraction : Number.NaN;
  const safeFraction =
    Number.isFinite(fractionValue) && fractionValue >= 0 && fractionValue < 0.9
      ? Number(fractionValue)
      : null;

  const cleaned: ForecastConfigState = {
    ...config,
    level: sortedLevels,
    model_type: safeModel,
    strategy: safeStrategy,
    log_transform: Boolean(config.log_transform),
    test_size_fraction: safeFraction,
    detect_frequency: config.detect_frequency !== false,
    missing_strategy: config.missing_strategy ?? "none",
    date_start: config.date_start ?? null,
    date_end: config.date_end ?? null,
  };

  const normalizeLayers = (value?: number) =>
    Number.isFinite(value) && (value === 1 || value === 2) ? value : undefined;
  const normalizePositiveInt = (value?: number) =>
    Number.isFinite(value) && value && value > 0 ? Math.round(value) : undefined;

  if (cleaned.module_type === "StatsForecast") {
    cleaned.lags = undefined;
    cleaned.input_size = undefined;
    cleaned.num_layers = undefined;
    cleaned.hidden_size = undefined;
    cleaned.epochs = undefined;
  } else if (cleaned.module_type === "MLForecast") {
    cleaned.input_size = undefined;
    cleaned.lags = cleaned.lags?.length ? cleaned.lags : [1, 7, 14];
    cleaned.num_layers = undefined;
    cleaned.hidden_size = undefined;
    cleaned.epochs = undefined;
  } else if (cleaned.module_type === "NeuralForecast") {
    cleaned.lags = undefined;
    cleaned.input_size = cleaned.input_size ?? 32;
    cleaned.num_layers = normalizeLayers(cleaned.num_layers) ?? 1;
    cleaned.hidden_size = normalizePositiveInt(cleaned.hidden_size) ?? 16;
    cleaned.epochs = normalizePositiveInt(cleaned.epochs) ?? 20;
  }

  return cleaned;
};

const applyDatasetRecommendations = (
  dataset: DatasetInfo,
  current: ForecastConfigState,
): ForecastConfigState => {
  const patch: Partial<ForecastConfigState> = {};

  if (dataset.freq) patch.freq = dataset.freq;
  if (dataset.season_length) patch.season_length = dataset.season_length;
  if (dataset.recommended_horizon) patch.horizon = dataset.recommended_horizon;
  if (dataset.recommended_module) patch.module_type = dataset.recommended_module;
  if (dataset.recommended_models?.length) patch.model_type = dataset.recommended_models[0];

  return sanitizeConfig({ ...current, ...patch });
};

const computeHoldoutSize = (rows: number, config: ForecastConfigState) => {
  const fractionHoldout = config.test_size_fraction
    ? Math.ceil(rows * config.test_size_fraction)
    : 0;
  if (rows <= 1 || fractionHoldout <= 0) return 0;
  // Keep at least one training point by capping holdout to rows - 1.
  return Math.max(1, Math.min(fractionHoldout, rows - 1));
};

const normalizeHeader = (line: string) =>
  line.split(",").map((cell, idx) => {
    const trimmed = cell.trim();
    return trimmed.length ? trimmed : `Unnamed: ${idx}`;
  });

const parseCsvRecords = (
  text: string,
  mapping: ColumnMapping = { ds: "ds", y: "y" },
): TimeSeriesRecord[] => {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = normalizeHeader(lines[0]).map((h) => h.toLowerCase());
  const dsIndex = headers.indexOf(mapping.ds.toLowerCase());
  const yIndex = headers.indexOf(mapping.y.toLowerCase());
  if (dsIndex === -1 || yIndex === -1) return [];

  const dataRows = lines.slice(1);

  const parsed: TimeSeriesRecord[] = [];
  for (const row of dataRows) {
    const cells = row.split(",");
    const ds = cells[dsIndex]?.trim();
    const yValue = parseFloat(cells[yIndex]);
    if (!ds || Number.isNaN(yValue)) continue;
    parsed.push({ ds, y: yValue });
  }
  return parsed;
};

const normalizeDetail = (detail: unknown): string => {
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (
          item &&
          typeof item === "object" &&
          "msg" in item &&
          typeof (item as { msg?: unknown }).msg === "string"
        ) {
          return (item as { msg: string }).msg;
        }
        if (item && typeof item === "object" && "detail" in item) {
          return normalizeDetail((item as { detail?: unknown }).detail);
        }
        return typeof item === "string" ? item : JSON.stringify(item);
      })
      .filter(Boolean);
    return messages.join(" | ");
  }

  if (detail && typeof detail === "object") {
    if ("msg" in detail && typeof (detail as { msg?: unknown }).msg === "string") {
      return (detail as { msg: string }).msg;
    }
    if ("detail" in detail) {
      return normalizeDetail((detail as { detail?: unknown }).detail);
    }
    return JSON.stringify(detail);
  }

  if (detail === null || detail === undefined) return "";
  return String(detail);
};

const resolveErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    const normalized = normalizeDetail(detail);
    if (normalized) return normalized;
    return error.message ?? "Request failed";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong";
};

const safeRead = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const safeWrite = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage failures */
  }
};

export const useForecast = (initialConfig?: Partial<ForecastConfigState>) => {
  const [config, setConfig] = useState<ForecastConfigState>(() => {
    const stored = safeRead<ForecastConfigState>("forecastConfig");
    return sanitizeConfig({ ...defaultConfig, ...initialConfig, ...(stored ?? {}) });
  });
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [preview, setPreview] = useState<TimeSeriesRecord[]>([]);
  const [history, setHistory] = useState<TimeSeriesRecord[]>([]);
  const [rows, setRows] = useState<number>(0);
  const [detectedFreq, setDetectedFreq] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<DatasetInfo | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>(null);
  const [sampleLoading, setSampleLoading] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchForecastResponse | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResponse | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastRunMs, setLastRunMs] = useState<number | null>(null);

  useEffect(() => {
    safeWrite("forecastConfig", config);
  }, [config]);

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const { data } = await axios.get<DatasetsResponse>(`${API_BASE}/datasets`);
        setDatasets(data.datasets ?? []);
        setDatasetsError(null);
      } catch (err) {
        console.warn("Failed to load sample datasets", err);
        setDatasets([]);
        setDatasetsError("Bundled sample datasets are unavailable right now.");
      }
    };
    fetchDatasets();
  }, []);

  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        setLoading((prev) => (prev === "idle" ? "configs" : prev));
        const { data } = await axios.get<SavedConfigsResponse>(`${API_BASE}/configs`);
        setSavedConfigs(data.configs ?? []);
      } catch (err) {
        console.warn("Failed to load saved configs", err);
      } finally {
        setLoading((prev) => (prev === "configs" ? "idle" : prev));
      }
    };
    fetchConfigs();
  }, []);

  const updateConfig = useCallback((patch: Partial<ForecastConfigState>) => {
    setConfig((prev) => sanitizeConfig({ ...prev, ...patch }));
  }, []);

  const readFileText = useCallback(async (file: File): Promise<string> => {
    if (typeof file.text === "function") {
      return file.text();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
      reader.readAsText(file);
    });
  }, []);

  const uploadFile = useCallback(
    async (file: File, mapping: ColumnMapping = { ds: "ds", y: "y" }) => {
      setLoading("upload");
      setError(null);
      setForecast(null);
      setLastRunMs(null);
      setSelectedDataset(null);
      setDataSource("upload");
      try {
        const text = await readFileText(file);
        const parsedRecords = parseCsvRecords(text, mapping);
        if (parsedRecords.length) {
          setHistory(parsedRecords);
        }

        const formData = new FormData();
        formData.append("file", file);
        if (mapping.ds) formData.append("ds_col", mapping.ds);
        if (mapping.y) formData.append("y_col", mapping.y);
        const { data } = await axios.post<UploadPreview>(`${API_BASE}/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        setUploadId(data.upload_id);
        setPreview(data.preview);
        setRows(data.rows);
        setDetectedFreq(data.detected_freq ?? null);
        if (data.detected_freq) {
          setConfig((prev) => sanitizeConfig({ ...prev, freq: data.detected_freq ?? prev.freq }));
        }
      } catch (err) {
        setError(resolveErrorMessage(err));
        setUploadId(null);
        setPreview([]);
        setRows(0);
        setDetectedFreq(null);
      } finally {
        setLoading("idle");
      }
    },
    [readFileText],
  );

  const loadSampleDataset = useCallback(async (datasetId: string) => {
    setLoading("upload");
    setSampleLoading(datasetId);
    setError(null);
    setForecast(null);
    setLastRunMs(null);
    setUploadId(null);
    try {
      const { data } = await axios.get<DatasetDetailResponse>(`${API_BASE}/datasets/${datasetId}`);
      setConfig((prev) => applyDatasetRecommendations(data.dataset, prev));
      setHistory(data.records);
      setPreview(data.records.slice(0, 5));
      setRows(data.records.length);
      setSelectedDataset(data.dataset);
      setDataSource("sample");
      setDetectedFreq(data.dataset.freq ?? null);
    } catch (err) {
      setError(resolveErrorMessage(err));
    } finally {
      setLoading("idle");
      setSampleLoading(null);
    }
  }, []);

  const runForecast = useCallback(
    async (override?: Partial<ForecastConfigState>) => {
      const nextConfig = sanitizeConfig({ ...config, ...(override ?? {}) });
      setConfig(nextConfig);

      if (!uploadId && history.length === 0) {
        setError("Upload a CSV or provide inline records before forecasting.");
        return;
      }

      setLoading("forecast");
      setError(null);
      setBatchResult(null);
      setBacktestResult(null);
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      try {
        const payload: Record<string, unknown> = {
          ...nextConfig,
          level: nextConfig.level.map((lvl) => Number(lvl)),
        };

        if (uploadId) {
          payload.upload_id = uploadId;
        } else {
          payload.records = history;
        }

        const { data } = await axios.post<ForecastResult>(`${API_BASE}/forecast`, payload);
        setForecast(data);
        const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        setLastRunMs(Math.max(0, Math.round(finishedAt - startedAt)));
      } catch (err) {
        setError(resolveErrorMessage(err));
        setLastRunMs(null);
      } finally {
        setLoading("idle");
      }
    },
    [config, history, uploadId],
  );

  const runBenchmark = useCallback(
    async (configs: ForecastConfigState[]) => {
      const candidates = configs.length ? configs : [config];
      if (!uploadId && history.length === 0) {
        setError("Upload a CSV or provide inline records before benchmarking.");
        return;
      }
      setLoading("benchmark");
      setError(null);
      setBatchResult(null);
      try {
        const payload: Record<string, unknown> = {
          configs: candidates.map((cfg) => ({
            ...sanitizeConfig(cfg),
            level: sanitizeConfig(cfg).level.map((lvl) => Number(lvl)),
          })),
        };
        if (uploadId) {
          payload.upload_id = uploadId;
        } else {
          payload.records = history;
        }
        const { data } = await axios.post<BatchForecastResponse>(
          `${API_BASE}/forecast/batch`,
          payload,
        );
        setBatchResult(data);
      } catch (err) {
        setError(resolveErrorMessage(err));
      } finally {
        setLoading("idle");
      }
    },
    [API_BASE, config, history, uploadId],
  );

  const runBacktest = useCallback(
    async (configs: ForecastConfigState[], windows = 3, step_size = 1) => {
      const candidates = configs.length ? configs : [config];
      if (!uploadId && history.length === 0) {
        setError("Upload a CSV or provide inline records before backtesting.");
        return;
      }
      setLoading("backtest");
      setError(null);
      setBacktestResult(null);
      try {
        const payload: Record<string, unknown> = {
          configs: candidates.map((cfg) => ({
            ...sanitizeConfig(cfg),
            level: sanitizeConfig(cfg).level.map((lvl) => Number(lvl)),
          })),
          windows,
          step_size,
        };
        if (uploadId) {
          payload.upload_id = uploadId;
        } else {
          payload.records = history;
        }
        const { data } = await axios.post<BacktestResponse>(`${API_BASE}/backtest`, payload);
        setBacktestResult(data);
      } catch (err) {
        setError(resolveErrorMessage(err));
      } finally {
        setLoading("idle");
      }
    },
    [API_BASE, config, history, uploadId],
  );

  const saveConfigPreset = useCallback(
    async (name: string, description?: string | null) => {
      try {
        const payload = {
          name,
          description: description ?? null,
          config: sanitizeConfig(config),
        };
        const { data } = await axios.post<SavedConfig>(`${API_BASE}/configs`, payload);
        setSavedConfigs((prev) => [...prev, data]);
        return data;
      } catch (err) {
        setError(resolveErrorMessage(err));
        return null;
      }
    },
    [API_BASE, config],
  );

  const refreshSavedConfigs = useCallback(async () => {
    try {
      const { data } = await axios.get<SavedConfigsResponse>(`${API_BASE}/configs`);
      setSavedConfigs(data.configs ?? []);
    } catch (err) {
      setError(resolveErrorMessage(err));
    }
  }, [API_BASE]);

  const deleteSavedConfig = useCallback(
    async (id: string) => {
      try {
        await axios.delete(`${API_BASE}/configs/${id}`);
        setSavedConfigs((prev) => prev.filter((cfg) => cfg.id !== id));
      } catch (err) {
        setError(resolveErrorMessage(err));
      }
    },
    [API_BASE],
  );

  const trainTest = useMemo(() => {
    if (!rows) return null;
    const test = Math.min(rows, computeHoldoutSize(rows, config));
    return {
      train: Math.max(rows - test, 0),
      test,
    };
  }, [config, rows]);

  return {
    API_BASE,
    config,
    updateConfig,
    uploadFile,
    runForecast,
    runBenchmark,
    runBacktest,
    saveConfigPreset,
    refreshSavedConfigs,
    uploadId,
    preview,
    rows,
    detectedFreq,
    datasets,
    datasetsError,
    loadSampleDataset,
    sampleLoading,
    selectedDataset,
    dataSource,
    history: history.length ? history : preview,
    forecast,
    batchResult,
    backtestResult,
    loading,
    error,
    lastRunMs,
    trainTest,
    savedConfigs,
    deleteSavedConfig,
  };
};

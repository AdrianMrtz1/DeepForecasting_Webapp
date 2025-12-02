export type ModuleType = "StatsForecast" | "MLForecast" | "NeuralForecast";

export type Strategy = "one_step" | "multi_step_recursive" | "multi_output_direct";

export interface TimeSeriesRecord {
  ds: string;
  y: number;
}

export interface ForecastConfigState {
  module_type: ModuleType;
  model_type: string;
  strategy: Strategy;
  freq: string;
  season_length: number;
  horizon: number;
  level: number[];
  lags?: number[];
  input_size?: number;
  num_layers?: number;
  hidden_size?: number;
  epochs?: number;
  log_transform?: boolean;
  test_size_fraction?: number | null;
   detect_frequency?: boolean;
   missing_strategy?: "none" | "drop" | "ffill" | "bfill" | "interpolate";
   date_start?: string | null;
   date_end?: string | null;
}

export interface UploadPreview {
  upload_id: string;
  preview: TimeSeriesRecord[];
  rows: number;
  detected_freq?: string | null;
}

export interface ConfidenceInterval {
  level: number;
  lower: number[];
  upper: number[];
}

export interface ForecastSeries {
  timestamps: string[];
  forecast: number[];
  bounds: ConfidenceInterval[];
}

export interface ForecastMetrics {
  mae?: number | null;
  rmse?: number | null;
  mape?: number | null;
}

export interface ForecastResult {
  timestamps: string[];
  forecast: number[];
  bounds: ConfidenceInterval[];
  metrics: ForecastMetrics;
  config: ForecastConfigState;
  fitted?: ForecastSeries | null;
}

export interface ForecastRun extends ForecastResult {
  runId: string;
  createdAt: number;
  durationMs?: number | null;
}

export interface LeaderboardEntry {
  model_label: string;
  module_type: ModuleType;
  metrics: ForecastMetrics;
  config: ForecastConfigState;
  created_at?: number | null;
}

export interface BatchForecastResponse {
  results: ForecastResult[];
  leaderboard: LeaderboardEntry[];
}

export interface BacktestWindowResult {
  window: number;
  train_size: number;
  test_size: number;
  metrics: ForecastMetrics;
}

export interface BacktestModelResult {
  config: ForecastConfigState;
  aggregate: ForecastMetrics;
  windows: BacktestWindowResult[];
}

export interface BacktestResponse {
  results: BacktestModelResult[];
  leaderboard: LeaderboardEntry[];
}

export interface SavedConfig {
  id: string;
  name: string;
  description?: string | null;
  config: ForecastConfigState;
  created_at: number;
}

export interface SavedConfigsResponse {
  configs: SavedConfig[];
}

export interface DatasetInfo {
  id: string;
  name: string;
  description: string;
  freq?: string | null;
  season_length?: number | null;
  recommended_horizon?: number | null;
  recommended_module?: ModuleType | null;
  recommended_models?: string[] | null;
  rows?: number | null;
  sample?: TimeSeriesRecord[];
}

export interface DatasetsResponse {
  datasets: DatasetInfo[];
}

export interface DatasetDetailResponse {
  dataset: DatasetInfo;
  records: TimeSeriesRecord[];
}

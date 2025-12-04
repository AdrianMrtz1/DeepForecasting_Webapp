"""Pydantic schemas for API inputs and outputs."""

from __future__ import annotations

from enum import Enum
from typing import Iterable

from pydantic import BaseModel, Field, field_validator, model_validator


class HealthResponse(BaseModel):
    """Schema for the health endpoint response."""

    status: str


class ModuleType(str, Enum):
    """Supported forecasting modules."""

    statsforecast = "StatsForecast"
    mlforecast = "MLForecast"
    neuralforecast = "NeuralForecast"


class Strategy(str, Enum):
    """Supported forecasting strategies."""

    one_step = "one_step"
    multi_step_recursive = "multi_step_recursive"
    multi_output_direct = "multi_output_direct"


class MissingStrategy(str, Enum):
    """Ways to handle missing values before training."""

    none = "none"
    drop = "drop"
    forward_fill = "ffill"
    interpolate = "interpolate"


ALLOWED_FREQUENCIES = {
    "H",
    "D",
    "W",
    "MS",
    "M",
    "QS",
    "Q",
    "YS",
    "Y",
}

STATSFORECAST_MODELS = {
    "arima",
    "auto_arima",
    "auto_ets",
    "naive",
    "seasonal_naive",
    "random_walk_with_drift",
    "window_average",
    "seasonal_window_average",
}

MLFORECAST_MODELS = {"xgboost", "lightgbm", "random_forest", "catboost", "linear"}

NEURALFORECAST_MODELS = {"mlp", "rnn", "lstm", "gru"}
RECURRENT_MODELS = {"rnn", "lstm", "gru"}


class TimeSeriesRecord(BaseModel):
    """A single time-series observation."""

    ds: str = Field(..., description="Timestamp in ISO-8601 format.")
    y: float = Field(..., description="Observed target value.")


class ForecastConfig(BaseModel):
    """
    Configuration shared across forecasting endpoints.

    Includes module/model selection and the hyperparameters needed to
    reproduce a run.
    """

    module_type: ModuleType = Field(..., description="Forecasting module to use.")
    model_type: str = Field(..., description="Model identifier within the selected module.")
    strategy: Strategy = Field(
        Strategy.multi_step_recursive,
        description="How the forecast is generated (one-step vs recursive vs direct).",
    )
    freq: str = Field(..., description="Pandas frequency string (e.g. D, H, MS).")
    season_length: int = Field(
        ...,
        gt=0,
        description="Periods in a season (e.g. 12 for monthly data with yearly seasonality).",
    )
    horizon: int = Field(..., gt=0, description="Forecast horizon in number of periods.")
    lags: list[int] | None = Field(
        default=None, description="Lag features (only for MLForecast models)."
    )
    input_size: int | None = Field(
        default=None,
        description="Lookback window size (only for NeuralForecast models).",
    )
    num_layers: int | None = Field(
        default=None,
        description="Hidden layers for NeuralForecast models (1-2).",
    )
    hidden_size: int | None = Field(
        default=None,
        description="Units per hidden layer for NeuralForecast models.",
    )
    epochs: int | None = Field(
        default=None,
        description="Training epochs/steps for NeuralForecast models.",
    )
    early_stop_patience: int | None = Field(
        default=None,
        description="Patience/rounds for early stopping when supported by the model.",
    )
    early_stop_validation_fraction: float | None = Field(
        default=None,
        description="Fraction of training data reserved for validation when early stopping is enabled (0-0.5).",
    )
    level: list[int] = Field(
        default_factory=lambda: [80, 90],
        description="Confidence levels in percentages (1-99).",
    )
    log_transform: bool = Field(
        default=False,
        description="Apply log1p to targets before training and invert for outputs.",
    )
    detect_frequency: bool = Field(
        default=True,
        description="Infer frequency from the uploaded timestamps and override freq when detected.",
    )
    missing_strategy: MissingStrategy = Field(
        default=MissingStrategy.none,
        description="How to handle missing values prior to training.",
    )
    date_start: str | None = Field(
        default=None,
        description="Optional inclusive lower bound for timestamps (ISO-8601).",
    )
    date_end: str | None = Field(
        default=None,
        description="Optional inclusive upper bound for timestamps (ISO-8601).",
    )
    test_size_fraction: float | None = Field(
        default=None,
        description="Optional fraction (0-1) of rows to reserve for the test set used in metrics.",
    )

    @field_validator("freq")
    @classmethod
    def validate_frequency(cls, freq: str) -> str:
        """Ensure frequency is one of the supported aliases."""
        if freq is None:
            raise ValueError("freq is required.")
        if freq not in ALLOWED_FREQUENCIES:
            allowed = ", ".join(sorted(ALLOWED_FREQUENCIES))
            raise ValueError(f"Unsupported freq '{freq}'. Choose one of: {allowed}.")
        return freq

    @field_validator("season_length", "horizon")
    @classmethod
    def validate_positive_int(cls, value: int) -> int:
        """Validate positive integer hyperparameters."""
        if value <= 0:
            raise ValueError("Value must be greater than zero.")
        return value

    @field_validator("model_type")
    @classmethod
    def normalize_model(cls, model_type: str) -> str:
        """Strip whitespace and normalize casing."""
        model = model_type.strip()
        if not model:
            raise ValueError("model_type cannot be empty.")
        return model.lower()

    @field_validator("lags")
    @classmethod
    def validate_lags(cls, lags: list[int] | None) -> list[int] | None:
        """Ensure lags are positive integers when provided."""
        if lags is None:
            return None
        cleaned: list[int] = []
        for lag in lags:
            if lag <= 0:
                raise ValueError("Lag values must be greater than zero.")
            cleaned.append(int(lag))
        unique_sorted = sorted(set(cleaned))
        return unique_sorted

    @field_validator("input_size")
    @classmethod
    def validate_input_size(cls, input_size: int | None) -> int | None:
        """Ensure input_size is positive when supplied."""
        if input_size is None:
            return None
        if input_size <= 0:
            raise ValueError("input_size must be greater than zero.")
        return input_size

    @field_validator("num_layers")
    @classmethod
    def validate_num_layers(cls, num_layers: int | None) -> int | None:
        """Validate optional hidden layer count for neural models."""
        if num_layers is None:
            return None
        if num_layers not in {1, 2}:
            raise ValueError("num_layers must be 1 or 2.")
        return num_layers

    @field_validator("hidden_size")
    @classmethod
    def validate_hidden_size(cls, hidden_size: int | None) -> int | None:
        """Ensure hidden_size is positive when supplied."""
        if hidden_size is None:
            return None
        if hidden_size <= 0:
            raise ValueError("hidden_size must be greater than zero.")
        return hidden_size

    @field_validator("epochs")
    @classmethod
    def validate_epochs(cls, epochs: int | None) -> int | None:
        """Ensure epochs is positive when supplied."""
        if epochs is None:
            return None
        if epochs <= 0:
            raise ValueError("epochs must be greater than zero.")
        return epochs

    @field_validator("early_stop_patience")
    @classmethod
    def validate_early_stop_patience(cls, patience: int | None) -> int | None:
        """Ensure early stopping patience is positive when supplied."""
        if patience is None:
            return None
        patience = int(patience)
        if patience <= 0:
            raise ValueError("early_stop_patience must be greater than zero.")
        return patience

    @field_validator("early_stop_validation_fraction")
    @classmethod
    def validate_early_stop_fraction(cls, fraction: float | None) -> float | None:
        """Keep the validation holdout small but positive when provided."""
        if fraction is None:
            return None
        if fraction <= 0 or fraction >= 0.5:
            raise ValueError("early_stop_validation_fraction must be between 0 and 0.5.")
        return float(fraction)

    @field_validator("level")
    @classmethod
    def validate_levels(cls, level: Iterable[int] | None) -> list[int]:
        """Normalize and validate confidence levels."""
        if level is None:
            return [80, 90]
        levels = sorted(set(int(lvl) for lvl in level))
        if not levels:
            raise ValueError("At least one confidence level is required.")
        for lvl in levels:
            if lvl <= 0 or lvl >= 100:
                raise ValueError("Confidence levels must be between 1 and 99.")
        return levels

    @field_validator("test_size_fraction")
    @classmethod
    def validate_test_size_fraction(cls, fraction: float | None) -> float | None:
        """Ensure test_size_fraction is between 0 and 1 when provided."""
        if fraction is None:
            return None
        if fraction < 0 or fraction >= 1:
            raise ValueError("test_size_fraction must be between 0 and 1.")
        return float(fraction)

    @model_validator(mode="after")
    def validate_module_combinations(self) -> "ForecastConfig":
        """Enforce module-specific constraints."""
        if self.module_type == ModuleType.statsforecast:
            allowed_models = STATSFORECAST_MODELS
            if self.strategy == Strategy.multi_output_direct:
                raise ValueError("multi_output_direct is not supported for StatsForecast.")
            if self.lags is not None:
                raise ValueError("lags are only used with MLForecast models.")
            if self.input_size is not None:
                raise ValueError("input_size is only used with NeuralForecast models.")
            if any(val is not None for val in (self.num_layers, self.hidden_size, self.epochs)):
                raise ValueError(
                    "num_layers, hidden_size, and epochs are only used with NeuralForecast models."
                )
        elif self.module_type == ModuleType.mlforecast:
            allowed_models = MLFORECAST_MODELS
            if not self.lags:
                raise ValueError("Provide at least one lag for MLForecast models.")
            if self.input_size is not None:
                raise ValueError("input_size is only used with NeuralForecast models.")
            if any(val is not None for val in (self.num_layers, self.hidden_size, self.epochs)):
                raise ValueError(
                    "num_layers, hidden_size, and epochs are only used with NeuralForecast models."
                )
        elif self.module_type == ModuleType.neuralforecast:
            allowed_models = NEURALFORECAST_MODELS
            if self.input_size is None:
                raise ValueError("input_size is required for NeuralForecast models.")
            if self.lags is not None:
                raise ValueError("lags are not used with NeuralForecast models.")
            # Allow optional neural-specific hyperparameters here.
        else:
            allowed_models = set()

        module_label = (
            f"ModuleType.{self.module_type.name}"
            if isinstance(self.module_type, ModuleType)
            else str(self.module_type)
        )
        if self.model_type not in allowed_models:
            allowed = ", ".join(sorted(allowed_models))
            raise ValueError(
                f"Model '{self.model_type}' is not valid for {module_label}. "
                f"Allowed models: {allowed}."
            )
        return self


class ForecastRequest(ForecastConfig):
    """Request payload for running a forecast."""

    upload_id: str | None = Field(
        default=None, description="Identifier returned by the /upload endpoint."
    )
    records: list[TimeSeriesRecord] | None = Field(
        default=None,
        description="Inline records to forecast when not using an uploaded file.",
    )

    @model_validator(mode="after")
    def validate_data_source(self) -> "ForecastRequest":
        """Ensure exactly one data source is provided."""
        has_upload = bool(self.upload_id)
        has_records = self.records is not None
        if has_upload == has_records:
            raise ValueError("Provide either upload_id or records, but not both.")
        if has_records and len(self.records) == 0:
            raise ValueError("records cannot be an empty list.")
        return self


class BatchForecastRequest(BaseModel):
    """Run multiple configs on the same dataset for leaderboard comparisons."""

    configs: list[ForecastConfig] = Field(..., description="Configs to benchmark.")
    upload_id: str | None = Field(default=None)
    records: list[TimeSeriesRecord] | None = Field(default=None)

    @model_validator(mode="after")
    def validate_inputs(self) -> "BatchForecastRequest":
        """Require one data source and at least one config."""
        if not self.configs:
            raise ValueError("Provide at least one config to benchmark.")
        has_upload = bool(self.upload_id)
        has_records = self.records is not None
        if has_upload == has_records:
            raise ValueError("Provide either upload_id or records, but not both.")
        if has_records and len(self.records) == 0:
            raise ValueError("records cannot be an empty list.")
        return self


class ForecastMetrics(BaseModel):
    """Metrics returned from a forecast run."""

    mae: float | None = Field(None, description="Mean absolute error.")
    rmse: float | None = Field(None, description="Root mean squared error.")
    mape: float | None = Field(None, description="Mean absolute percentage error.")


class ConfidenceInterval(BaseModel):
    """Lower/upper bounds for a given confidence level."""

    level: int = Field(..., description="Confidence level percentage.")
    lower: list[float] = Field(..., description="Lower bounds per timestamp.")
    upper: list[float] = Field(..., description="Upper bounds per timestamp.")


class ForecastSeries(BaseModel):
    """Generic time-indexed series carrying forecasts and optional bounds."""

    timestamps: list[str] = Field(..., description="Ordered timestamps for the series.")
    forecast: list[float] = Field(..., description="Forecasted values aligned to timestamps.")
    bounds: list[ConfidenceInterval] = Field(
        default_factory=list, description="Optional confidence intervals aligned to the series."
    )

    @model_validator(mode="after")
    def validate_lengths(self) -> "ForecastSeries":
        """Ensure arrays align across timestamps, forecasts, and bounds."""
        horizon_len = len(self.timestamps)
        if len(self.forecast) != horizon_len:
            raise ValueError("Forecast series must align timestamps and values.")
        for interval in self.bounds:
            if len(interval.lower) != horizon_len or len(interval.upper) != horizon_len:
                raise ValueError("Forecast interval lengths must match the timestamps.")
        return self


class ForecastResponse(BaseModel):
    """Response payload for a completed forecast."""

    timestamps: list[str] = Field(..., description="Forecast horizon timestamps.")
    forecast: list[float] = Field(..., description="Point forecasts for each timestamp.")
    bounds: list[ConfidenceInterval] = Field(
        default_factory=list, description="Per-level confidence intervals."
    )
    metrics: ForecastMetrics = Field(
        default_factory=ForecastMetrics, description="Computed forecast accuracy metrics."
    )
    config: ForecastConfig = Field(
        ..., description="Echoed configuration used to generate the forecast."
    )
    fitted: ForecastSeries | None = Field(
        default=None, description="Optional in-sample predictions aligned to the training data."
    )

    @model_validator(mode="after")
    def validate_lengths(self) -> "ForecastResponse":
        """Ensure all lists align with the forecast horizon length."""
        horizon_len = len(self.timestamps)
        if len(self.forecast) != horizon_len:
            raise ValueError("forecast and timestamps lengths must match.")
        for interval in self.bounds:
            if len(interval.lower) != horizon_len or len(interval.upper) != horizon_len:
                raise ValueError("Confidence interval lengths must match the timestamps.")
        return self


class UploadResponse(BaseModel):
    """Response returned after validating and storing an uploaded CSV."""

    upload_id: str = Field(..., description="Identifier for the uploaded dataset.")
    preview: list[TimeSeriesRecord] = Field(
        ..., description="First few validated rows from the upload."
    )
    rows: int = Field(..., description="Total number of valid rows in the upload.")
    detected_freq: str | None = Field(
        default=None,
        description="Inferred pandas frequency string (if detected) for convenience.",
    )


class DatasetInfo(BaseModel):
    """Metadata describing a bundled sample dataset."""

    id: str = Field(..., description="Unique dataset identifier.")
    name: str = Field(..., description="Human-friendly dataset name.")
    description: str = Field(..., description="Short description of the dataset.")
    freq: str | None = Field(
        default=None, description="Recommended pandas frequency string (e.g., D, W, MS)."
    )
    season_length: int | None = Field(
        default=None, description="Suggested season length aligned with the frequency."
    )
    recommended_horizon: int | None = Field(
        default=None, description="Suggested forecast horizon for quick demos."
    )
    recommended_module: ModuleType | None = Field(
        default=None, description="Suggested module to try first with this dataset."
    )
    recommended_models: list[str] | None = Field(
        default=None,
        description="Suggested model identifiers (case-insensitive) for this dataset.",
    )
    rows: int | None = Field(None, description="Row count when known.")
    sample: list[TimeSeriesRecord] = Field(
        default_factory=list, description="Optional preview rows."
    )


class DatasetsResponse(BaseModel):
    """Wrapper for the datasets endpoint."""

    datasets: list[DatasetInfo] = Field(
        default_factory=list, description="Bundled datasets available for quick testing."
    )


class DatasetDetailResponse(BaseModel):
    """Full payload for a single bundled dataset, including all records."""

    dataset: DatasetInfo = Field(..., description="Metadata describing the dataset.")
    records: list[TimeSeriesRecord] = Field(
        ..., description="Complete time-series records for the dataset."
    )


class LeaderboardEntry(BaseModel):
    """Comparison row for multiple model runs."""

    model_label: str = Field(..., description="Human-readable model label.")
    module_type: ModuleType = Field(..., description="Module the model belongs to.")
    metrics: ForecastMetrics = Field(
        default_factory=ForecastMetrics, description="Aggregate metrics for ranking."
    )
    config: ForecastConfig = Field(..., description="Config used for this run.")
    created_at: float | None = Field(
        default=None, description="Unix timestamp when the run completed."
    )


class BatchForecastResponse(BaseModel):
    """Response for running multiple forecasts on the same dataset."""

    results: list[ForecastResponse] = Field(default_factory=list)
    leaderboard: list[LeaderboardEntry] = Field(default_factory=list)


class BacktestWindowResult(BaseModel):
    """Metrics per backtest window."""

    window: int = Field(..., description="Window index (1-based).")
    train_size: int = Field(..., description="Rows used for training in this window.")
    test_size: int = Field(..., description="Rows evaluated in this window.")
    metrics: ForecastMetrics = Field(default_factory=ForecastMetrics)


class BacktestModelResult(BaseModel):
    """Aggregated backtest results for a single model."""

    config: ForecastConfig = Field(..., description="Configuration under test.")
    aggregate: ForecastMetrics = Field(default_factory=ForecastMetrics)
    windows: list[BacktestWindowResult] = Field(default_factory=list)


class BacktestRequest(BaseModel):
    """Payload describing a multi-window backtest across one or more models."""

    configs: list[ForecastConfig] = Field(..., description="Model configurations to backtest.")
    windows: int = Field(3, gt=0, description="How many rolling windows to evaluate.")
    step_size: int = Field(
        1, gt=0, description="Number of rows to advance the window each iteration."
    )
    upload_id: str | None = Field(default=None)
    records: list[TimeSeriesRecord] | None = Field(default=None)

    @model_validator(mode="after")
    def validate_backtest(self) -> "BacktestRequest":
        """Ensure data source and configs are supplied."""
        if not self.configs:
            raise ValueError("Provide at least one config to backtest.")
        has_upload = bool(self.upload_id)
        has_records = self.records is not None
        if has_upload == has_records:
            raise ValueError("Provide either upload_id or records, but not both.")
        if has_records and len(self.records) == 0:
            raise ValueError("records cannot be an empty list.")
        return self


class BacktestResponse(BaseModel):
    """Response for rolling backtests."""

    results: list[BacktestModelResult] = Field(default_factory=list)
    leaderboard: list[LeaderboardEntry] = Field(default_factory=list)


class SavedConfig(BaseModel):
    """Persisted configuration for reuse across sessions."""

    id: str = Field(..., description="Unique identifier for the saved config.")
    name: str = Field(..., description="Human-friendly name.")
    description: str | None = Field(default=None, description="Optional notes for this config.")
    config: ForecastConfig = Field(..., description="Stored forecast configuration.")
    created_at: float = Field(..., description="Unix timestamp when saved.")


class SavedConfigRequest(BaseModel):
    """Payload to save a config."""

    name: str = Field(..., description="Name of the saved configuration.")
    description: str | None = Field(default=None)
    config: ForecastConfig = Field(..., description="Configuration to persist.")


class SavedConfigsResponse(BaseModel):
    """List wrapper for saved configs."""

    configs: list[SavedConfig] = Field(default_factory=list)

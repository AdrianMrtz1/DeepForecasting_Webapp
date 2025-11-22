"""Forecasting service abstraction for Nixtla and StatsForecast models."""

from __future__ import annotations

import logging
import os
from typing import Any, Iterable

import numpy as np
import pandas as pd
from nixtla import NixtlaClient
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA

from app.models import (
    ConfidenceInterval,
    ForecastConfig,
    ForecastMetrics,
    ForecastResponse,
    ModuleType,
    Strategy,
    TIMEGPT_MODEL,
)

logger = logging.getLogger(__name__)


class NixtlaService:
    """
    Encapsulates forecasting logic across Nixtla TimeGPT and StatsForecast.

    The service prefers TimeGPT when an API key is available and falls back
    to StatsForecast's AutoARIMA when the remote call fails or the key is
    missing. Only StatsForecast/TimeGPT paths are implemented for now; other
    module types are explicitly rejected.
    """

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or os.getenv("NIXTLA_API_KEY")
        self._client: NixtlaClient | None = None
        if self.api_key:
            try:
                self._client = NixtlaClient(api_key=self.api_key)
            except Exception as exc:  # pragma: no cover - defensive log path
                logger.warning("Failed to initialize Nixtla client: %s", exc)
                self._client = None

    def forecast(
        self,
        data: pd.DataFrame,
        config: ForecastConfig | dict[str, Any],
    ) -> ForecastResponse:
        """
        Run a forecast using TimeGPT or AutoARIMA.

        The provided data must contain `ds` and `y` columns. Metrics are computed
        against a simple holdout split (last `horizon` rows) when available, with
        alignment mirroring the Streamlit prototype's `fix_forecast_actuals`.
        """
        config_obj = config if isinstance(config, ForecastConfig) else ForecastConfig(**config)
        self._validate_strategy_support(config_obj)

        df = self._prepare_dataframe(data)
        train_df, holdout_df = self._train_test_split(df, config_obj.horizon)

        forecast_df, resolved_model = self._run_forecast(train_df, config_obj)
        model_column = self._resolve_model_column(forecast_df, resolved_model)

        aligned_df, metrics = self._align_with_actuals(
            forecast_df, holdout_df, model_column
        )
        bounds = self._build_intervals(aligned_df, model_column, config_obj.level)

        timestamps = [self._to_iso(ts) for ts in aligned_df["ds"]]
        forecast_values = aligned_df[model_column].astype(float).tolist()

        return ForecastResponse(
            timestamps=timestamps,
            forecast=forecast_values,
            bounds=bounds,
            metrics=metrics or ForecastMetrics(),
            config=config_obj,
        )

    def _prepare_dataframe(self, data: pd.DataFrame) -> pd.DataFrame:
        """Ensure required columns exist and are sorted chronologically."""
        if not isinstance(data, pd.DataFrame):
            raise TypeError("data must be a pandas DataFrame.")
        if "ds" not in data.columns or "y" not in data.columns:
            raise ValueError("data must contain 'ds' and 'y' columns.")

        df = data.copy()
        df["ds"] = pd.to_datetime(df["ds"])
        df["y"] = pd.to_numeric(df["y"])
        df = df.sort_values("ds").reset_index(drop=True)
        return df

    def _train_test_split(
        self, df: pd.DataFrame, horizon: int
    ) -> tuple[pd.DataFrame, pd.DataFrame | None]:
        """Hold out the last `horizon` rows for metric computation when possible."""
        if horizon <= 0:
            raise ValueError("horizon must be a positive integer.")
        if len(df) <= horizon:
            return df, None
        return df.iloc[:-horizon].reset_index(drop=True), df.iloc[-horizon:].reset_index(drop=True)

    def _run_forecast(
        self, train_df: pd.DataFrame, config: ForecastConfig
    ) -> tuple[pd.DataFrame, str]:
        """Dispatch to TimeGPT or AutoARIMA based on configuration and availability."""
        if config.module_type != ModuleType.statsforecast:
            raise NotImplementedError(
                f"Module '{config.module_type}' is not implemented. "
                "Only StatsForecast/TimeGPT is currently supported."
            )

        if config.model_type == TIMEGPT_MODEL:
            fcst_df = self._forecast_timegpt(train_df, config)
            if fcst_df is not None:
                return fcst_df, TIMEGPT_MODEL
            logger.info("TimeGPT forecast unavailable; falling back to AutoARIMA.")
            return self._forecast_auto_arima(train_df, config), "auto_arima"

        if config.model_type == "auto_arima":
            return self._forecast_auto_arima(train_df, config), "auto_arima"

        raise NotImplementedError(
            f"Model '{config.model_type}' is not supported yet. "
            "Use 'timegpt' or 'auto_arima' for now."
        )

    def _forecast_timegpt(
        self, train_df: pd.DataFrame, config: ForecastConfig
    ) -> pd.DataFrame | None:
        """Invoke Nixtla TimeGPT when the client is initialized."""
        if self._client is None:
            return None
        try:
            return self._client.forecast(
                df=train_df[["ds", "y"]],
                h=config.horizon,
                freq=config.freq,
                level=config.level,
            )
        except Exception as exc:  # pragma: no cover - external API failure
            logger.warning("TimeGPT forecast failed: %s", exc)
            return None

    def _forecast_auto_arima(
        self, train_df: pd.DataFrame, config: ForecastConfig
    ) -> pd.DataFrame:
        """Run StatsForecast AutoARIMA as a local fallback."""
        sf_df = train_df.copy()
        sf_df["unique_id"] = "series"

        try:
            sf = StatsForecast(
                models=[AutoARIMA(season_length=config.season_length)],
                freq=config.freq,
                n_jobs=1,
            )
            return sf.fit(sf_df).predict(h=config.horizon, level=config.level)
        except Exception as exc:
            raise RuntimeError("StatsForecast AutoARIMA forecast failed.") from exc

    def _resolve_model_column(self, fcst_df: pd.DataFrame, model_type: str) -> str:
        """Find the forecast column in the returned DataFrame."""
        candidates = {
            model_type,
            model_type.lower(),
            model_type.upper(),
            model_type.capitalize(),
            "mean",
        }
        non_interval_cols = [
            col
            for col in fcst_df.columns
            if "-lo-" not in col and "-hi-" not in col and col not in {"ds", "unique_id"}
        ]
        for col in non_interval_cols:
            if col in candidates:
                return col
        if non_interval_cols:
            return non_interval_cols[0]
        raise ValueError("Unable to locate forecast column in response.")

    def _align_with_actuals(
        self,
        forecast_df: pd.DataFrame,
        holdout_df: pd.DataFrame | None,
        model_column: str,
    ) -> tuple[pd.DataFrame, ForecastMetrics | None]:
        """
        Align forecasted values with actuals for metrics, mirroring fix_forecast_actuals.
        """
        aligned = forecast_df.reset_index(drop=True).copy()
        if holdout_df is None or holdout_df.empty:
            return aligned, None

        n_match = min(len(aligned), len(holdout_df))
        aligned.loc[: n_match - 1, "ds"] = holdout_df["ds"].iloc[:n_match].values

        metrics = self._compute_metrics(
            y_true=holdout_df["y"].iloc[:n_match],
            y_pred=aligned[model_column].iloc[:n_match],
        )
        return aligned, metrics

    def _build_intervals(
        self, fcst_df: pd.DataFrame, model_column: str, levels: Iterable[int]
    ) -> list[ConfidenceInterval]:
        """Convert lower/upper bound columns into the response schema."""
        intervals: list[ConfidenceInterval] = []
        for lvl in levels:
            lower_col = f"{model_column}-lo-{int(lvl)}"
            upper_col = f"{model_column}-hi-{int(lvl)}"
            if lower_col in fcst_df.columns and upper_col in fcst_df.columns:
                intervals.append(
                    ConfidenceInterval(
                        level=int(lvl),
                        lower=fcst_df[lower_col].astype(float).tolist(),
                        upper=fcst_df[upper_col].astype(float).tolist(),
                    )
                )
        return intervals

    def _compute_metrics(
        self, y_true: Iterable[float], y_pred: Iterable[float]
    ) -> ForecastMetrics:
        """Calculate MAE, RMSE, and MAPE for the aligned slices."""
        true_arr = np.asarray(list(y_true), dtype=float)
        pred_arr = np.asarray(list(y_pred), dtype=float)
        if true_arr.size == 0 or pred_arr.size == 0:
            return ForecastMetrics()

        n_match = min(true_arr.size, pred_arr.size)
        true_arr = true_arr[:n_match]
        pred_arr = pred_arr[:n_match]

        errors = true_arr - pred_arr
        mae = float(np.mean(np.abs(errors)))
        rmse = float(np.sqrt(np.mean(np.square(errors))))

        non_zero_mask = true_arr != 0
        mape = (
            float(np.mean(np.abs(errors[non_zero_mask] / true_arr[non_zero_mask])) * 100)
            if non_zero_mask.any()
            else None
        )
        return ForecastMetrics(mae=mae, rmse=rmse, mape=mape)

    def _validate_strategy_support(self, config: ForecastConfig) -> None:
        """Guard unsupported strategy/model combinations early."""
        if config.module_type != ModuleType.statsforecast:
            raise NotImplementedError(
                f"Module '{config.module_type}' is not supported yet. "
                "Only StatsForecast/TimeGPT is implemented."
            )
        if config.strategy not in {
            Strategy.one_step,
            Strategy.multi_step_recursive,
        }:
            raise ValueError(
                f"Strategy '{config.strategy}' is not supported for StatsForecast/TimeGPT."
            )

    @staticmethod
    def _to_iso(value: Any) -> str:
        """Convert pandas timestamps to ISO-8601 strings for the response."""
        if isinstance(value, pd.Timestamp):
            return value.isoformat()
        return str(value)

"""Forecasting service abstraction for Nixtla and StatsForecast models."""

from __future__ import annotations

import logging
from typing import Any, Iterable

import numpy as np
import pandas as pd
from statsforecast import StatsForecast
from statsforecast.models import (
    ARIMA,
    AutoARIMA,
    AutoETS,
    Naive,
    RandomWalkWithDrift,
    SeasonalNaive,
    SeasonalWindowAverage,
    WindowAverage,
)

from app.models import (
    ALLOWED_FREQUENCIES,
    BacktestModelResult,
    BacktestRequest,
    BacktestResponse,
    BacktestWindowResult,
    BatchForecastRequest,
    BatchForecastResponse,
    ConfidenceInterval,
    ForecastConfig,
    ForecastMetrics,
    ForecastSeries,
    ForecastResponse,
    LeaderboardEntry,
    ModuleType,
    MissingStrategy,
    Strategy,
)
from app.utils.data_processing import apply_missing_strategy, filter_date_range, infer_frequency

logger = logging.getLogger(__name__)


class NixtlaService:
    """
    Encapsulates forecasting logic across StatsForecast, MLForecast, and NeuralForecast.
    """

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key

    def forecast(
        self,
        data: pd.DataFrame,
        config: ForecastConfig | dict[str, Any],
    ) -> ForecastResponse:
        """
        Run a forecast using the configured module/model.

        The provided data must contain `ds` and `y` columns. Metrics are computed
        against a simple holdout split (driven by `test_size_fraction`) when available, with
        alignment mirroring the Streamlit prototype's `fix_forecast_actuals`.
        """
        config_obj = config if isinstance(config, ForecastConfig) else ForecastConfig(**config)
        self._validate_strategy_support(config_obj)

        df = self._prepare_dataframe(data)
        df = self._apply_filters(df, config_obj)
        config_obj = self._maybe_detect_frequency(df, config_obj)

        holdout_size = self._determine_test_size(len(df), config_obj)

        # One-step backtesting iterates with horizon=1 to mimic the lecture notebooks.
        run_config = (
            config_obj.model_copy(update={"horizon": 1})
            if config_obj.strategy == Strategy.one_step
            else config_obj
        )

        model_df = self._apply_log_transform(df) if config_obj.log_transform else df.copy()
        train_df, holdout_df, holdout_actuals = self._train_test_split(
            model_df, holdout_size, raw_df=df
        )

        if config_obj.strategy == Strategy.one_step and holdout_df is not None:
            forecast_df, resolved_model = self._one_step_forecast(train_df, holdout_df, run_config)
            fitted_df = None
        else:
            forecast_df, resolved_model, fitted_df = self._run_forecast(train_df, run_config)
        model_column = self._resolve_model_column(forecast_df, resolved_model)

        forecast_df = self._drop_non_finite_rows(
            forecast_df, model_column, run_config.level, required=True
        )
        if fitted_df is not None:
            fitted_df = self._drop_non_finite_rows(fitted_df, model_column, run_config.level)

        if run_config.log_transform:
            forecast_df = self._invert_log_transform_forecast(
                forecast_df, model_column, run_config.level
            )
            if fitted_df is not None:
                fitted_df = self._invert_log_transform_forecast(
                    fitted_df, model_column, run_config.level
                )

        aligned_df, metrics = self._align_with_actuals(
            forecast_df, holdout_actuals, model_column
        )
        bounds = self._build_intervals(aligned_df, model_column, run_config.level)

        timestamps = [self._to_iso(ts) for ts in aligned_df["ds"]]
        forecast_values = aligned_df[model_column].astype(float).tolist()

        fitted_segment = None
        if fitted_df is not None:
            fitted_timestamps = [self._to_iso(ts) for ts in fitted_df["ds"]]
            fitted_forecast = fitted_df[model_column].astype(float).tolist()
            fitted_segment = ForecastSeries(
                timestamps=fitted_timestamps,
                forecast=fitted_forecast,
                bounds=self._build_intervals(fitted_df, model_column, run_config.level),
            )

        return ForecastResponse(
            timestamps=timestamps,
            forecast=forecast_values,
            bounds=bounds,
            metrics=metrics or ForecastMetrics(),
            config=config_obj,
            fitted=fitted_segment,
        )

    def forecast_many(
        self,
        data: pd.DataFrame,
        request: BatchForecastRequest | dict[str, Any],
    ) -> BatchForecastResponse:
        """Run multiple configs on the same dataset and return a leaderboard."""
        req_obj = request if isinstance(request, BatchForecastRequest) else BatchForecastRequest(**request)

        results: list[ForecastResponse] = []
        leaderboard: list[LeaderboardEntry] = []
        for cfg in req_obj.configs:
            response = self.forecast(data.copy(), cfg)
            results.append(response)
            leaderboard.append(
                LeaderboardEntry(
                    model_label=f"{response.config.module_type}/{response.config.model_type}",
                    module_type=response.config.module_type,
                    metrics=response.metrics,
                    config=response.config,
                )
            )

        ranked = self._rank_leaderboard(leaderboard)
        return BatchForecastResponse(results=results, leaderboard=ranked)

    def backtest(
        self,
        data: pd.DataFrame,
        request: BacktestRequest | dict[str, Any],
    ) -> BacktestResponse:
        """
        Run rolling backtests across one or more configs.

        Windows step forward through the tail of the series, each time evaluating the next
        `horizon` rows to mimic production forecasting cadence.
        """
        req_obj = request if isinstance(request, BacktestRequest) else BacktestRequest(**request)
        aggregated_results: list[BacktestModelResult] = []
        leaderboard_rows: list[LeaderboardEntry] = []

        base_df = self._prepare_dataframe(data)

        for cfg in req_obj.configs:
            self._validate_strategy_support(cfg)
            df = self._apply_filters(base_df, cfg)
            cfg = self._maybe_detect_frequency(df, cfg)

            model_df = self._apply_log_transform(df) if cfg.log_transform else df.copy()
            splits = self._build_backtest_slices(
                len(model_df), cfg.horizon, req_obj.windows, req_obj.step_size
            )
            window_results: list[BacktestWindowResult] = []
            metrics_buffer: list[ForecastMetrics] = []

            for window_idx, train_end, test_start, test_end in splits:
                train_df = model_df.iloc[:train_end].reset_index(drop=True)
                holdout_df = model_df.iloc[test_start:test_end].reset_index(drop=True)
                holdout_actuals = df.iloc[test_start:test_end].reset_index(drop=True)
                if holdout_df.empty or len(train_df) < 2:
                    continue

                run_cfg = cfg.model_copy(update={"horizon": len(holdout_df)})
                if run_cfg.strategy == Strategy.one_step:
                    fcst_df, resolved_model = self._one_step_forecast(train_df, holdout_df, run_cfg)
                    fitted_df = None
                else:
                    fcst_df, resolved_model, fitted_df = self._run_forecast(train_df, run_cfg)
                    _ = fitted_df  # fitted not surfaced in backtest response

                model_column = self._resolve_model_column(fcst_df, resolved_model)
                fcst_df = self._drop_non_finite_rows(
                    fcst_df, model_column, run_cfg.level, required=True
                )

                if run_cfg.log_transform:
                    fcst_df = self._invert_log_transform_forecast(
                        fcst_df, model_column, run_cfg.level
                    )

                aligned_df, metrics = self._align_with_actuals(
                    fcst_df, holdout_actuals, model_column
                )
                _ = aligned_df  # aligned_df unused; metrics derived from it
                metrics = metrics or ForecastMetrics()
                window_results.append(
                    BacktestWindowResult(
                        window=window_idx,
                        train_size=len(train_df),
                        test_size=len(holdout_df),
                        metrics=metrics,
                    )
                )
                metrics_buffer.append(metrics)

            aggregate = self._average_metrics(metrics_buffer)
            model_result = BacktestModelResult(config=cfg, aggregate=aggregate, windows=window_results)
            aggregated_results.append(model_result)
            leaderboard_rows.append(
                LeaderboardEntry(
                    model_label=f"{cfg.module_type}/{cfg.model_type}",
                    module_type=cfg.module_type,
                    metrics=aggregate,
                    config=cfg,
                )
            )

        ranked = self._rank_leaderboard(leaderboard_rows)
        return BacktestResponse(results=aggregated_results, leaderboard=ranked)

    def _prepare_dataframe(self, data: pd.DataFrame) -> pd.DataFrame:
        """Ensure required columns exist and are sorted chronologically."""
        if not isinstance(data, pd.DataFrame):
            raise TypeError("data must be a pandas DataFrame.")
        if "ds" not in data.columns or "y" not in data.columns:
            raise ValueError("data must contain 'ds' and 'y' columns.")

        df = data.copy()
        extra_columns = [col for col in df.columns if col not in {"ds", "y"}]
        if extra_columns:
            logger.debug("Dropping unused columns from forecast input: %s", extra_columns)
        df = df[["ds", "y"]].copy()
        df["ds"] = pd.to_datetime(df["ds"])
        df["y"] = pd.to_numeric(df["y"])
        df = df.sort_values("ds").reset_index(drop=True)
        return df

    def _apply_filters(self, df: pd.DataFrame, config: ForecastConfig) -> pd.DataFrame:
        """Apply date-range filtering and missing-value handling."""
        filtered = filter_date_range(df, config.date_start, config.date_end)
        strategy = (
            config.missing_strategy.value
            if isinstance(config.missing_strategy, MissingStrategy)
            else str(config.missing_strategy)
        )
        filled = apply_missing_strategy(filtered, strategy)
        if len(filled) < 2:
            raise ValueError("Not enough observations after filtering. Adjust the date range.")
        return filled.reset_index(drop=True)

    def _maybe_detect_frequency(self, df: pd.DataFrame, config: ForecastConfig) -> ForecastConfig:
        """Infer frequency when enabled and override the config if supported."""
        if not getattr(config, "detect_frequency", False):
            return config
        detected = infer_frequency(df["ds"])
        if detected and detected in ALLOWED_FREQUENCIES and detected != config.freq:
            return config.model_copy(update={"freq": detected})
        return config

    def _train_test_split(
        self, df: pd.DataFrame, holdout_size: int, raw_df: pd.DataFrame | None = None
    ) -> tuple[pd.DataFrame, pd.DataFrame | None, pd.DataFrame | None]:
        """Hold out the last rows for metric computation when possible."""
        if holdout_size <= 0 or len(df) <= holdout_size:
            return df.reset_index(drop=True), None, None

        train = df.iloc[:-holdout_size].reset_index(drop=True)
        holdout = df.iloc[-holdout_size:].reset_index(drop=True)
        holdout_actuals = (
            raw_df.iloc[-holdout_size:].reset_index(drop=True) if raw_df is not None else None
        )
        return train, holdout, holdout_actuals

    def _one_step_forecast(
        self,
        train_df: pd.DataFrame,
        holdout_df: pd.DataFrame,
        config: ForecastConfig,
    ) -> tuple[pd.DataFrame, str]:
        """
        Roll forward one-step forecasts using actuals at each step.

        Mirrors the lecture notebooks' "optimistic" backtest where the model is
        retrained/updated with each new actual before predicting the next step.
        """
        if holdout_df is None or holdout_df.empty:
            raise ValueError("One-step forecasting requires holdout data.")

        rolling_train = train_df.reset_index(drop=True).copy()
        predictions: list[float] = []
        interval_buffers: dict[int, dict[str, list[float]]] = {
            int(lvl): {"lower": [], "upper": []} for lvl in config.level
        }

        resolved_model: str | None = None
        model_column: str | None = None

        for idx in range(len(holdout_df)):
            step_config = config.model_copy(update={"horizon": 1})
            forecast_slice, resolved, _ = self._run_forecast(rolling_train, step_config)
            resolved_model = resolved

            model_column = self._resolve_model_column(forecast_slice, resolved_model)
            predictions.append(float(forecast_slice.iloc[0][model_column]))

            for lvl in config.level:
                lower_col = f"{model_column}-lo-{int(lvl)}"
                upper_col = f"{model_column}-hi-{int(lvl)}"
                buffers = interval_buffers[int(lvl)]
                if lower_col in forecast_slice.columns:
                    buffers["lower"].append(float(forecast_slice.iloc[0][lower_col]))
                if upper_col in forecast_slice.columns:
                    buffers["upper"].append(float(forecast_slice.iloc[0][upper_col]))

            # Incorporate the actual observation before the next step.
            rolling_train = pd.concat(
                [rolling_train, holdout_df.iloc[[idx]]], ignore_index=True
            )

        ds_values = holdout_df["ds"].tolist()
        data = {"ds": ds_values, model_column or config.model_type: predictions}

        if model_column:
            for lvl, bounds in interval_buffers.items():
                if bounds["lower"] and bounds["upper"]:
                    data[f"{model_column}-lo-{int(lvl)}"] = bounds["lower"]
                    data[f"{model_column}-hi-{int(lvl)}"] = bounds["upper"]

        forecast_df = pd.DataFrame(data)
        return forecast_df, resolved_model or config.model_type

    def _determine_test_size(self, total_rows: int, config: ForecastConfig) -> int:
        """Calculate how many rows to reserve for test metrics based on user fraction."""
        if total_rows <= 1:
            return 0

        fraction = config.test_size_fraction
        if fraction is None:
            holdout_default = min(config.horizon, total_rows - 1)
            return max(0, holdout_default)
        if fraction <= 0:
            return 0

        holdout = int(np.ceil(total_rows * fraction))
        return max(1, min(holdout, total_rows - 1))

    def _apply_log_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Apply log1p transform while validating the domain of y."""
        if (df["y"] <= -1).any():
            raise ValueError("log_transform requires all 'y' values to be greater than -1.")
        transformed = df.copy()
        transformed["y"] = np.log1p(transformed["y"])
        return transformed

    def _run_forecast(
        self, train_df: pd.DataFrame, config: ForecastConfig
    ) -> tuple[pd.DataFrame, str, pd.DataFrame | None]:
        """Dispatch to the requested module/model, falling back when needed."""
        if config.module_type == ModuleType.statsforecast:
            if config.model_type == "auto_arima":
                forecast_df, fitted_df = self._forecast_auto_arima(train_df, config)
                return forecast_df, "auto_arima", fitted_df

            forecast_df, resolved_model, fitted_df = self._forecast_statsforecast(train_df, config)
            return forecast_df, resolved_model, fitted_df

        if config.module_type == ModuleType.mlforecast:
            return self._forecast_mlforecast(train_df, config)

        if config.module_type == ModuleType.neuralforecast:
            return self._forecast_neuralforecast(train_df, config)

        raise NotImplementedError(f"Module '{config.module_type}' is not supported yet.")

    def _forecast_auto_arima(
        self, train_df: pd.DataFrame, config: ForecastConfig
    ) -> tuple[pd.DataFrame, pd.DataFrame | None]:
        """Run StatsForecast AutoARIMA as a local fallback."""
        sf_df = train_df.copy()
        sf_df["unique_id"] = "series"

        try:
            sf = StatsForecast(
                models=[AutoARIMA(season_length=config.season_length)],
                freq=config.freq,
                n_jobs=1,
            )
            forecast_df = sf.forecast(
                df=sf_df,
                h=config.horizon,
                level=config.level,
                fitted=True,
            )
            fitted_values = sf.forecast_fitted_values()
            return forecast_df, fitted_values
        except Exception as exc:
            raise ValueError(f"StatsForecast AutoARIMA forecast failed: {exc}") from exc

    def _forecast_statsforecast(
        self, train_df: pd.DataFrame, config: ForecastConfig
    ) -> tuple[pd.DataFrame, str, pd.DataFrame | None]:
        """Run a StatsForecast model other than AutoARIMA."""
        sf_df = train_df.copy()
        sf_df["unique_id"] = "series"

        model = self._build_statsforecast_model(config)
        try:
            sf = StatsForecast(models=[model], freq=config.freq, n_jobs=1)
            forecast_df = sf.forecast(
                df=sf_df,
                h=config.horizon,
                level=config.level,
                fitted=True,
            )
            fitted_values: pd.DataFrame | None = None
            try:
                fitted_values = sf.forecast_fitted_values()
            except Exception:
                fitted_values = None
            resolved_model = getattr(model, "alias", config.model_type)
            return forecast_df, resolved_model, fitted_values
        except Exception as exc:
            raise ValueError(f"StatsForecast {config.model_type} forecast failed: {exc}") from exc

    def _build_statsforecast_model(self, config: ForecastConfig):
        """Instantiate the requested StatsForecast model with sensible defaults."""
        model_type = config.model_type
        season_length = config.season_length
        window_size = max(2, season_length)

        if model_type == "auto_arima":
            return AutoARIMA(season_length=season_length, alias=model_type)
        if model_type == "auto_ets":
            return AutoETS(season_length=season_length, alias=model_type)
        if model_type == "arima":
            return ARIMA(order=(1, 0, 0), season_length=season_length, alias=model_type)
        if model_type == "naive":
            return Naive(alias=model_type)
        if model_type == "seasonal_naive":
            return SeasonalNaive(season_length=season_length, alias=model_type)
        if model_type == "random_walk_with_drift":
            return RandomWalkWithDrift(alias=model_type)
        if model_type == "window_average":
            return WindowAverage(window_size=window_size, alias=model_type)
        if model_type == "seasonal_window_average":
            return SeasonalWindowAverage(
                season_length=season_length, window_size=window_size, alias=model_type
            )

        raise NotImplementedError(f"Model '{model_type}' is not supported yet.")

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

    def _forecast_mlforecast(
        self, train_df: pd.DataFrame, config: ForecastConfig
    ) -> tuple[pd.DataFrame, str, pd.DataFrame | None]:
        """Run an MLForecast model (tree/linear regressors over lags)."""
        if not config.lags:
            raise ValueError("Provide at least one lag for MLForecast models.")

        try:
            from mlforecast import MLForecast
        except ImportError as exc:  # pragma: no cover - optional dependency path
            raise ImportError(
                "mlforecast is required for MLForecast models. Install with `pip install mlforecast` "
                "and the desired regressors (e.g., xgboost, lightgbm, catboost)."
            ) from exc

        df = train_df.copy()
        df["unique_id"] = "series"

        model = self._build_ml_model(config.model_type)
        fit_kwargs = {"max_horizon": config.horizon} if config.strategy == Strategy.multi_output_direct else {}
        try:
            forecaster = MLForecast(
                models={config.model_type: model},
                freq=config.freq,
                lags=list(config.lags),
            )
            forecaster.fit(df[["unique_id", "ds", "y"]], **fit_kwargs)
            forecast_df = forecaster.predict(h=config.horizon)
            return forecast_df, config.model_type, None
        except Exception as exc:
            raise ValueError(f"MLForecast {config.model_type} forecast failed: {exc}") from exc

    def _build_ml_model(self, model_type: str):
        """Map config names to MLForecast regressors with safe defaults."""
        name = model_type.lower()

        if name == "linear":
            from sklearn.linear_model import LinearRegression

            return LinearRegression()

        if name == "random_forest":
            from sklearn.ensemble import RandomForestRegressor

            return RandomForestRegressor(
                n_estimators=200,
                random_state=42,
                min_samples_leaf=2,
            )

        if name == "xgboost":
            try:
                from xgboost import XGBRegressor
            except ImportError as exc:  # pragma: no cover - optional dependency path
                raise ImportError("Install xgboost to use the xgboost model.") from exc

            return XGBRegressor(
                n_estimators=300,
                learning_rate=0.05,
                max_depth=6,
                subsample=0.8,
                objective="reg:squarederror",
            )

        if name == "lightgbm":
            try:
                from lightgbm import LGBMRegressor
            except ImportError as exc:  # pragma: no cover - optional dependency path
                raise ImportError("Install lightgbm to use the lightgbm model.") from exc

            return LGBMRegressor(
                n_estimators=400,
                learning_rate=0.05,
                subsample=0.8,
            )

        if name == "catboost":
            try:
                from catboost import CatBoostRegressor
            except ImportError as exc:  # pragma: no cover - optional dependency path
                raise ImportError("Install catboost to use the catboost model.") from exc

            return CatBoostRegressor(
                depth=8,
                learning_rate=0.05,
                loss_function="RMSE",
                iterations=500,
                verbose=False,
            )

        raise NotImplementedError(f"Unknown MLForecast model '{model_type}'.")

    def _forecast_neuralforecast(
        self, train_df: pd.DataFrame, config: ForecastConfig
    ) -> tuple[pd.DataFrame, str, pd.DataFrame | None]:
        """Run a NeuralForecast model (MLP/RNN/LSTM/GRU)."""
        try:
            self._ensure_ray_stub()
            from neuralforecast import NeuralForecast
            from neuralforecast.losses.pytorch import MAE
            from neuralforecast.models import GRU, LSTM, MLP, RNN
        except ImportError as exc:  # pragma: no cover - optional dependency path
            hint = (
                "NeuralForecast needs the `neuralforecast` package. "
                "On Python 3.13 where ray wheels are unavailable, install with "
                "`pip install --no-deps neuralforecast==3.1.2` after the other requirements."
            )
            raise ValueError(f"neuralforecast is required for NeuralForecast models. {hint}") from exc

        df = train_df.copy()
        df["unique_id"] = "series"

        recurrent_capable = config.model_type in {"rnn", "lstm", "gru"}
        use_recurrent = config.strategy == Strategy.multi_step_recursive and recurrent_capable

        model = self._build_neural_model(
            config,
            mae_cls=MAE,
            mlp_cls=MLP,
            rnn_cls=RNN,
            lstm_cls=LSTM,
            gru_cls=GRU,
            recurrent=use_recurrent,
        )

        try:
            forecaster = NeuralForecast(models=[model], freq=config.freq)
            forecaster.fit(df[["unique_id", "ds", "y"]])
            forecast_df = forecaster.predict()
            return forecast_df, config.model_type, None
        except Exception as exc:
            raise ValueError(f"NeuralForecast {config.model_type} forecast failed: {exc}") from exc

    def _build_neural_model(
        self,
        config: ForecastConfig,
        *,
        mae_cls,
        mlp_cls,
        rnn_cls,
        lstm_cls,
        gru_cls,
        recurrent: bool = False,
    ):
        """Map config names to NeuralForecast architectures."""
        name = config.model_type
        input_size = config.input_size or max(1, config.season_length)
        layers = config.num_layers
        hidden = config.hidden_size
        epochs = config.epochs
        common_kwargs = {"h": config.horizon, "input_size": input_size, "loss": mae_cls()}
        if epochs is not None:
            common_kwargs["max_steps"] = epochs

        if name == "mlp":
            if layers is not None:
                common_kwargs["num_layers"] = layers
            if hidden is not None:
                common_kwargs["hidden_size"] = hidden
            return mlp_cls(**common_kwargs)
        if name == "rnn":
            rnn_kwargs = {
                **common_kwargs,
                "recurrent": recurrent,
            }
            if layers is not None:
                rnn_kwargs["encoder_n_layers"] = layers
                rnn_kwargs["decoder_layers"] = layers
            if hidden is not None:
                rnn_kwargs["encoder_hidden_size"] = hidden
                rnn_kwargs["decoder_hidden_size"] = hidden
            return rnn_cls(**rnn_kwargs)
        if name == "lstm":
            lstm_kwargs = {
                **common_kwargs,
                "recurrent": recurrent,
            }
            if layers is not None:
                lstm_kwargs["encoder_n_layers"] = layers
                lstm_kwargs["decoder_layers"] = layers
            if hidden is not None:
                lstm_kwargs["encoder_hidden_size"] = hidden
                lstm_kwargs["decoder_hidden_size"] = hidden
            return lstm_cls(**lstm_kwargs)
        if name == "gru":
            gru_kwargs = {
                **common_kwargs,
                "recurrent": recurrent,
            }
            if layers is not None:
                gru_kwargs["encoder_n_layers"] = layers
                gru_kwargs["decoder_layers"] = layers
            if hidden is not None:
                gru_kwargs["encoder_hidden_size"] = hidden
                gru_kwargs["decoder_hidden_size"] = hidden
            return gru_cls(**gru_kwargs)

        raise NotImplementedError(f"Unknown NeuralForecast model '{name}'.")

    def _ensure_ray_stub(self) -> None:
        """
        NeuralForecast imports ray even when tuning isn't used; provide a minimal stub when ray
        wheels are unavailable (e.g., Python 3.13) so basic models still run.
        """
        try:
            import ray  # type: ignore  # noqa: F401

            return
        except ModuleNotFoundError:
            import sys
            import types

            logger.warning(
                "ray is not installed; using a lightweight stub to enable NeuralForecast models. "
                "Auto* tuning features will be unavailable."
            )

            ray_stub = types.ModuleType("ray")
            ray_stub.air = types.SimpleNamespace()

            class _DummyTuneReportCallback:  # pragma: no cover - runtime fallback
                def __init__(self, *args, **kwargs):
                    pass

            class _DummyBasicVariantGenerator:  # pragma: no cover - runtime fallback
                def __init__(self, *args, **kwargs):
                    pass

            tune_integration_pl = types.ModuleType("ray.tune.integration.pytorch_lightning")
            tune_integration_pl.TuneReportCallback = _DummyTuneReportCallback
            tune_integration = types.ModuleType("ray.tune.integration")
            tune_integration.pytorch_lightning = tune_integration_pl

            tune_search_basic = types.ModuleType("ray.tune.search.basic_variant")
            tune_search_basic.BasicVariantGenerator = _DummyBasicVariantGenerator
            tune_search = types.ModuleType("ray.tune.search")
            tune_search.basic_variant = tune_search_basic

            tune_module = types.ModuleType("ray.tune")
            tune_module.integration = tune_integration
            tune_module.search = tune_search

            ray_stub.tune = tune_module

            sys.modules.setdefault("ray", ray_stub)
            sys.modules.setdefault("ray.air", ray_stub.air)
            sys.modules.setdefault("ray.tune", tune_module)
            sys.modules.setdefault("ray.tune.integration", tune_integration)
            sys.modules.setdefault(
                "ray.tune.integration.pytorch_lightning", tune_integration_pl
            )
            sys.modules.setdefault("ray.tune.search", tune_search)
            sys.modules.setdefault("ray.tune.search.basic_variant", tune_search_basic)

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

    def _invert_log_transform_forecast(
        self, fcst_df: pd.DataFrame, model_column: str, levels: Iterable[int]
    ) -> pd.DataFrame:
        """Back-transform forecast outputs and intervals after log1p training."""
        inverted = fcst_df.copy()
        inverted[model_column] = np.expm1(inverted[model_column])
        for lvl in levels:
            lower_col = f"{model_column}-lo-{int(lvl)}"
            upper_col = f"{model_column}-hi-{int(lvl)}"
            if lower_col in inverted.columns:
                inverted[lower_col] = np.expm1(inverted[lower_col])
            if upper_col in inverted.columns:
                inverted[upper_col] = np.expm1(inverted[upper_col])
        return inverted

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

    def _drop_non_finite_rows(
        self,
        df: pd.DataFrame,
        model_column: str,
        levels: Iterable[int],
        *,
        required: bool = False,
    ) -> pd.DataFrame:
        """
        Remove rows where the forecast or bounds contain NaN/inf to keep JSON serializable outputs.
        """
        if df.empty:
            if required:
                raise ValueError("Forecast produced no rows.")
            return df

        columns = [model_column]
        for lvl in levels:
            lower_col = f"{model_column}-lo-{int(lvl)}"
            upper_col = f"{model_column}-hi-{int(lvl)}"
            if lower_col in df.columns:
                columns.append(lower_col)
            if upper_col in df.columns:
                columns.append(upper_col)

        mask = np.ones(len(df), dtype=bool)
        for col in columns:
            mask &= np.isfinite(df[col])

        cleaned = df.loc[mask].reset_index(drop=True)
        if cleaned.empty and required:
            raise ValueError("Forecast contained no finite predictions.")
        return cleaned

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

    def _average_metrics(self, metrics: Iterable[ForecastMetrics]) -> ForecastMetrics:
        """Average metrics across windows while ignoring missing values."""
        maes, rmses, mapes = [], [], []
        for m in metrics:
            if m.mae is not None:
                maes.append(m.mae)
            if m.rmse is not None:
                rmses.append(m.rmse)
            if m.mape is not None:
                mapes.append(m.mape)
        return ForecastMetrics(
            mae=float(np.mean(maes)) if maes else None,
            rmse=float(np.mean(rmses)) if rmses else None,
            mape=float(np.mean(mapes)) if mapes else None,
        )

    def _rank_leaderboard(self, rows: list[LeaderboardEntry]) -> list[LeaderboardEntry]:
        """Sort leaderboard rows by RMSE then MAE."""
        def score(entry: LeaderboardEntry) -> float:
            if entry.metrics.rmse is not None:
                return entry.metrics.rmse
            if entry.metrics.mae is not None:
                return entry.metrics.mae + 1_000_000
            return float("inf")

        return sorted(rows, key=score)

    def _build_backtest_slices(
        self, total_rows: int, horizon: int, windows: int, step: int
    ) -> list[tuple[int, int, int, int]]:
        """
        Build rolling train/test splits.

        Returns a list of tuples: (window_index, train_end_idx, test_start_idx, test_end_idx)
        where indices are positional offsets into the sorted dataframe.
        """
        if total_rows <= 2 or horizon <= 0:
            return []

        splits: list[tuple[int, int, int, int]] = []
        start = max(1, total_rows - horizon * windows)

        for idx in range(windows):
            test_start = start + idx * step
            test_end = min(test_start + horizon, total_rows)
            train_end = test_start
            if train_end < 2 or test_start >= total_rows or test_end <= test_start:
                continue
            splits.append((idx + 1, train_end, test_start, test_end))

        return splits

    def _validate_strategy_support(self, config: ForecastConfig) -> None:
        """Guard unsupported strategy/model combinations early."""
        if config.module_type == ModuleType.statsforecast:
            allowed = {Strategy.one_step, Strategy.multi_step_recursive}
        elif config.module_type in {ModuleType.mlforecast, ModuleType.neuralforecast}:
            allowed = {
                Strategy.one_step,
                Strategy.multi_step_recursive,
                Strategy.multi_output_direct,
            }
        else:
            raise NotImplementedError(f"Module '{config.module_type}' is not supported yet.")

        if config.strategy not in allowed:
            raise ValueError(
                f"Strategy '{config.strategy}' is not supported for {config.module_type}."
            )

    @staticmethod
    def _to_iso(value: Any) -> str:
        """Convert pandas timestamps to ISO-8601 strings for the response."""
        if isinstance(value, pd.Timestamp):
            return value.isoformat()
        return str(value)

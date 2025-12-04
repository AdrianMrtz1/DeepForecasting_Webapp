from __future__ import annotations

from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest

from app.models import ForecastConfig, ModuleType, Strategy
from app.services.forecaster import NixtlaService


def build_sample_df() -> pd.DataFrame:
    dates = pd.date_range("2024-01-01", periods=6, freq="D")
    values = [1, 2, 3, 4, 5, 6]
    return pd.DataFrame({"ds": dates, "y": values})


@pytest.mark.parametrize("model_type", ["window_average", "seasonal_window_average"])
def test_window_average_models_skip_fitted_and_intervals(model_type: str) -> None:
    periods = 12 if model_type == "seasonal_window_average" else 6
    df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-01", periods=periods, freq="D"),
            "y": np.arange(1, periods + 1),
        }
    )
    config = ForecastConfig(
        module_type=ModuleType.statsforecast,
        model_type=model_type,
        strategy=Strategy.multi_step_recursive,
        freq="D",
        season_length=3,
        horizon=2,
        level=[80],
    )

    service = NixtlaService(api_key=None)
    response = service.forecast(df, config)

    assert response.fitted is None
    assert response.bounds == []
    expected_len = service._determine_test_size(len(df), config) + config.horizon
    assert len(response.forecast) == expected_len

def test_forecast_includes_fitted_predictions_when_available() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.statsforecast,
        model_type="auto_arima",
        strategy=Strategy.multi_step_recursive,
        freq="D",
        season_length=1,
        horizon=2,
        level=[80],
    )

    forecast_df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-07", periods=2, freq="D"),
            "auto_arima": [5.0, 6.0],
            "auto_arima-lo-80": [4.0, 5.0],
            "auto_arima-hi-80": [6.0, 7.0],
        }
    )
    fitted_df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-01", periods=6, freq="D"),
            "y": [1, 2, 3, 4, 5, 6],
            "auto_arima": [1.1, 1.9, 3.1, 3.9, 5.2, 5.8],
        }
    )

    service = NixtlaService(api_key=None)
    with patch.object(
        NixtlaService, "_run_forecast", return_value=(forecast_df, "auto_arima", fitted_df)
    ):
        response = service.forecast(df, config)

    assert response.fitted is not None
    assert response.fitted.forecast == pytest.approx(fitted_df["auto_arima"].tolist())
    assert response.fitted.timestamps[0].startswith("2024-01-01")
    assert response.metrics.mape == 0.0
    assert response.bounds[0].lower == [4.0, 5.0]
    assert response.bounds[0].upper == [6.0, 7.0]


def test_fitted_rows_with_nan_are_dropped_before_response() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.statsforecast,
        model_type="auto_arima",
        strategy=Strategy.multi_step_recursive,
        freq="D",
        season_length=1,
        horizon=2,
        level=[80],
    )

    forecast_df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-07", periods=2, freq="D"),
            "auto_arima": [5.0, 6.0],
            "auto_arima-lo-80": [4.0, 5.0],
            "auto_arima-hi-80": [6.0, 7.0],
        }
    )
    fitted_df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-01", periods=3, freq="D"),
            "auto_arima": [np.nan, 2.0, 3.0],
            "auto_arima-lo-80": [np.nan, 1.5, 2.5],
            "auto_arima-hi-80": [np.nan, 2.5, 3.5],
        }
    )

    service = NixtlaService(api_key=None)
    with patch.object(
        NixtlaService, "_run_forecast", return_value=(forecast_df, "auto_arima", fitted_df)
    ):
        response = service.forecast(df, config)

    assert response.fitted is not None
    # First row contained NaN; it should have been removed.
    assert response.fitted.forecast == [2.0, 3.0]
    assert response.fitted.bounds[0].lower == [1.5, 2.5]
    assert response.fitted.bounds[0].upper == [2.5, 3.5]


def test_forecast_routes_mlforecast_module() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.mlforecast,
        model_type="linear",
        strategy=Strategy.multi_step_recursive,
        freq="D",
        season_length=1,
        horizon=2,
        lags=[1, 2],
        level=[80],
    )
    stub_df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-07", periods=2, freq="D"),
            "linear": [5.0, 6.0],
        }
    )
    service = NixtlaService(api_key=None)

    with patch.object(
        NixtlaService, "_forecast_mlforecast", return_value=(stub_df, "linear", None)
    ) as mock_ml:
        response = service.forecast(df, config)

    mock_ml.assert_called_once()
    assert response.forecast == [5.0, 6.0]
    assert response.metrics.mae == pytest.approx(0.0)
    assert response.metrics.rmse == pytest.approx(0.0)
    assert response.metrics.mape == pytest.approx(0.0)


def test_forecast_routes_neural_module() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.neuralforecast,
        model_type="mlp",
        strategy=Strategy.multi_step_recursive,
        freq="D",
        season_length=1,
        horizon=2,
        input_size=3,
        level=[80],
    )
    stub_df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-07", periods=2, freq="D"),
            "mlp": [5.0, 6.0],
        }
    )
    service = NixtlaService(api_key=None)

    with patch.object(
        NixtlaService, "_forecast_neuralforecast", return_value=(stub_df, "mlp", None)
    ) as mock_neural:
        response = service.forecast(df, config)

    mock_neural.assert_called_once()
    assert response.forecast == [5.0, 6.0]
    assert response.metrics.mae == pytest.approx(0.0)
    assert response.metrics.rmse == pytest.approx(0.0)


def test_prepare_dataframe_validates_required_columns() -> None:
    service = NixtlaService(api_key=None)
    df = pd.DataFrame({"timestamp": pd.date_range("2024-01-01", periods=3, freq="D"), "y": [1, 2, 3]})

    with pytest.raises(ValueError, match="must contain 'ds' and 'y'"):
        service._prepare_dataframe(df)  # type: ignore[attr-defined]


def test_log_transform_applies_and_inverts_predictions() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.statsforecast,
        model_type="auto_arima",
        strategy=Strategy.multi_step_recursive,
        freq="D",
        season_length=1,
        horizon=2,
        level=[80],
        log_transform=True,
    )

    forecast_df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-07", periods=2, freq="D"),
            "auto_arima": np.log1p([5.0, 6.0]),
            "auto_arima-lo-80": np.log1p([4.0, 5.0]),
            "auto_arima-hi-80": np.log1p([6.0, 7.0]),
        }
    )

    service = NixtlaService(api_key=None)
    with patch.object(
        NixtlaService, "_run_forecast", return_value=(forecast_df, "auto_arima", None)
    ) as mock_run:
        response = service.forecast(df, config)

    train_df = mock_run.call_args[0][0]
    assert train_df["y"].iloc[0] == pytest.approx(np.log1p(1))
    assert response.forecast == pytest.approx([5.0, 6.0])
    assert response.bounds[0].lower == pytest.approx([4.0, 5.0])
    assert response.bounds[0].upper == pytest.approx([6.0, 7.0])
    assert response.metrics.mae == pytest.approx(0.0)
    assert response.metrics.rmse == pytest.approx(0.0)
    assert response.metrics.mape == pytest.approx(0.0)


def test_test_size_fraction_reserves_rows_for_metrics() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.statsforecast,
        model_type="auto_arima",
        strategy=Strategy.multi_step_recursive,
        freq="D",
        season_length=1,
        horizon=1,
        level=[80],
        test_size_fraction=0.5,
    )

    forecast_df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-07", periods=3, freq="D"),
            "auto_arima": [4.0, 5.0, 6.0],
        }
    )

    service = NixtlaService(api_key=None)
    with patch.object(
        NixtlaService, "_run_forecast", return_value=(forecast_df, "auto_arima", None)
    ) as mock_run:
        response = service.forecast(df, config)

    train_df = mock_run.call_args[0][0]
    assert len(train_df) == 3  # 50% of 6 rows reserved for test set, so 3 left for training
    assert response.forecast == [4.0, 5.0, 6.0]
    assert response.metrics.mae == pytest.approx(0.0)
    assert response.metrics.rmse == pytest.approx(0.0)


def test_zero_test_fraction_uses_full_history_and_skips_metrics() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.statsforecast,
        model_type="auto_arima",
        strategy=Strategy.multi_step_recursive,
        freq="D",
        season_length=1,
        horizon=2,
        level=[80],
        test_size_fraction=0.0,
    )

    forecast_df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-07", periods=2, freq="D"),
            "auto_arima": [4.0, 5.0],
        }
    )

    service = NixtlaService(api_key=None)
    with patch.object(
        NixtlaService, "_run_forecast", return_value=(forecast_df, "auto_arima", None)
    ) as mock_run:
        response = service.forecast(df, config)

    train_df = mock_run.call_args[0][0]
    assert len(train_df) == len(df)
    assert response.metrics.mae is None
    assert response.metrics.rmse is None


def test_one_step_strategy_rolls_forward_with_horizon_one() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.statsforecast,
        model_type="auto_arima",
        strategy=Strategy.one_step,
        freq="D",
        season_length=1,
        horizon=2,
        level=[80],
    )

    calls: list[int] = []

    def rolling_stub(train_df: pd.DataFrame, run_config: ForecastConfig):
        calls.append(run_config.horizon)
        next_ds = train_df["ds"].max() + pd.Timedelta(days=1)
        value = float(len(train_df) + 1)
        return (
            pd.DataFrame({"ds": [next_ds], "auto_arima": [value]}),
            "auto_arima",
            None,
        )

    service = NixtlaService(api_key=None)
    with patch.object(NixtlaService, "_run_forecast", side_effect=rolling_stub) as mock_run:
        response = service.forecast(df, config)

    # Two holdout rows -> two one-step runs with horizon forced to 1
    assert calls == [1, 1]
    assert mock_run.call_count == 2
    assert response.forecast == [5.0, 6.0]
    assert response.timestamps[:2] == ["2024-01-05T00:00:00", "2024-01-06T00:00:00"]
    assert response.metrics.mae == pytest.approx(0.0)


def test_mlforecast_direct_strategy_is_supported() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.mlforecast,
        model_type="linear",
        strategy=Strategy.multi_output_direct,
        freq="D",
        season_length=1,
        horizon=2,
        lags=[1, 2],
        level=[80],
    )
    forecast_df = pd.DataFrame(
        {"ds": pd.date_range("2024-01-07", periods=2, freq="D"), "linear": [5.0, 6.0]}
    )

    service = NixtlaService(api_key=None)
    with patch.object(
        NixtlaService, "_forecast_mlforecast", return_value=(forecast_df, "linear", None)
    ) as mock_ml:
        response = service.forecast(df, config)

    mock_ml.assert_called_once()
    assert response.forecast == [5.0, 6.0]
    assert response.metrics.mae == pytest.approx(0.0)


def test_neuralforecast_direct_strategy_is_supported() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.neuralforecast,
        model_type="mlp",
        strategy=Strategy.multi_output_direct,
        freq="D",
        season_length=1,
        horizon=2,
        input_size=3,
        level=[80],
    )
    forecast_df = pd.DataFrame(
        {"ds": pd.date_range("2024-01-07", periods=2, freq="D"), "mlp": [5.0, 6.0]}
    )

    service = NixtlaService(api_key=None)
    with patch.object(
        NixtlaService, "_forecast_neuralforecast", return_value=(forecast_df, "mlp", None)
    ) as mock_nf:
        response = service.forecast(df, config)

    mock_nf.assert_called_once()
    assert response.forecast == [5.0, 6.0]
    assert response.metrics.rmse == pytest.approx(0.0)

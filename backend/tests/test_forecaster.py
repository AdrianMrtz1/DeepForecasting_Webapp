from __future__ import annotations

from unittest.mock import patch

import pandas as pd
import pytest

from app.models import ForecastConfig, ModuleType, Strategy
from app.services.forecaster import NixtlaService


def build_sample_df() -> pd.DataFrame:
    dates = pd.date_range("2024-01-01", periods=6, freq="D")
    values = [1, 2, 3, 4, 5, 6]
    return pd.DataFrame({"ds": dates, "y": values})


def test_forecast_falls_back_to_auto_arima_when_timegpt_unavailable() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.statsforecast,
        model_type="timegpt",
        strategy=Strategy.multi_step_recursive,
        freq="D",
        season_length=1,
        horizon=2,
        level=[80],
    )

    fallback_df = pd.DataFrame(
        {
            "ds": pd.date_range("2024-01-07", periods=2, freq="D"),
            "auto_arima": [5.0, 6.0],
            "auto_arima-lo-80": [4.0, 5.0],
            "auto_arima-hi-80": [6.0, 7.0],
        }
    )

    service = NixtlaService(api_key=None)
    with patch.object(NixtlaService, "_forecast_timegpt", return_value=None) as mock_timegpt, patch.object(
        NixtlaService, "_forecast_auto_arima", return_value=fallback_df
    ) as mock_auto:
        response = service.forecast(df, config)

    mock_timegpt.assert_called_once()
    mock_auto.assert_called_once()
    assert response.forecast == [5.0, 6.0]
    assert response.bounds[0].level == 80
    assert response.metrics.mae == 0.0
    assert response.metrics.rmse == 0.0
    assert response.metrics.mape == 0.0
    assert response.bounds[0].lower == [4.0, 5.0]
    assert response.bounds[0].upper == [6.0, 7.0]


def test_forecast_rejects_unsupported_module() -> None:
    df = build_sample_df()
    config = ForecastConfig(
        module_type=ModuleType.mlforecast,
        model_type="xgboost",
        strategy=Strategy.multi_step_recursive,
        freq="D",
        season_length=1,
        horizon=2,
        lags=[1, 2],
        level=[80],
    )
    service = NixtlaService(api_key=None)

    with pytest.raises(NotImplementedError, match="Module 'MLForecast' is not supported yet"):
        service.forecast(df, config)


def test_prepare_dataframe_validates_required_columns() -> None:
    service = NixtlaService(api_key=None)
    df = pd.DataFrame({"timestamp": pd.date_range("2024-01-01", periods=3, freq="D"), "y": [1, 2, 3]})

    with pytest.raises(ValueError, match="must contain 'ds' and 'y'"):
        service._prepare_dataframe(df)  # type: ignore[attr-defined]

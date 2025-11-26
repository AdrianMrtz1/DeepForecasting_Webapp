from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models import ForecastConfig, ForecastRequest, ModuleType, Strategy


def base_config(**overrides) -> dict:
    config = {
        "module_type": ModuleType.statsforecast,
        "model_type": "auto_arima",
        "strategy": Strategy.multi_step_recursive,
        "freq": "D",
        "season_length": 1,
        "horizon": 2,
        "level": [80],
    }
    config.update(overrides)
    return config


def test_forecast_config_validates_frequency() -> None:
    with pytest.raises(ValueError, match="Unsupported freq"):
        ForecastConfig(**base_config(freq="INVALID"))


def test_forecast_config_mlforecast_requires_lags() -> None:
    with pytest.raises(ValueError, match="Provide at least one lag"):
        ForecastConfig(**base_config(module_type=ModuleType.mlforecast, model_type="xgboost"))


def test_forecast_config_neuralforecast_requires_input_size() -> None:
    with pytest.raises(ValueError, match="input_size is required"):
        ForecastConfig(
            **base_config(module_type=ModuleType.neuralforecast, model_type="mlp", lags=None)
        )


def test_forecast_config_rejects_unknown_model_for_statsforecast() -> None:
    with pytest.raises(
        ValidationError, match="Model 'lstm' is not valid for ModuleType.statsforecast"
    ):
        ForecastConfig(**base_config(model_type="lstm"))


def test_forecast_config_rejects_invalid_test_fraction() -> None:
    with pytest.raises(ValueError, match="test_size_fraction must be between 0 and 1"):
        ForecastConfig(**base_config(test_size_fraction=1.5))


def test_forecast_request_requires_one_data_source() -> None:
    with pytest.raises(ValueError, match="either upload_id or records"):
        ForecastRequest(**base_config(upload_id="abc", records=[]))

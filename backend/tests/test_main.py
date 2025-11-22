from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import (
    ConfidenceInterval,
    ForecastConfig,
    ForecastMetrics,
    ForecastResponse,
    ModuleType,
    Strategy,
)


def _build_stub_response(config: ForecastConfig) -> ForecastResponse:
    return ForecastResponse(
        timestamps=["2024-01-05", "2024-01-06"],
        forecast=[10.0, 11.0],
        bounds=[ConfidenceInterval(level=90, lower=[8.0, 9.0], upper=[12.0, 13.0])],
        metrics=ForecastMetrics(mae=1.0, rmse=1.2, mape=10.0),
        config=config,
    )


def test_upload_and_forecast_flow_returns_stubbed_response() -> None:
    app = create_app()
    client = TestClient(app)

    csv_payload = "ds,y\n2024-01-01,1\n2024-01-02,2\n2024-01-03,3\n2024-01-04,4\n"
    config = ForecastConfig(
        module_type=ModuleType.statsforecast,
        model_type="auto_arima",
        strategy=Strategy.multi_step_recursive,
        freq="D",
        season_length=1,
        horizon=2,
        level=[90],
    )
    stub_response = _build_stub_response(config)

    with patch("app.main.NixtlaService.forecast", return_value=stub_response) as mock_forecast:
        upload_resp = client.post(
            "/upload", files={"file": ("data.csv", csv_payload, "text/csv")}
        )
        assert upload_resp.status_code == 201
        upload_id = upload_resp.json()["upload_id"]

        payload = {
            "upload_id": upload_id,
            "module_type": "StatsForecast",
            "model_type": "auto_arima",
            "strategy": "multi_step_recursive",
            "freq": "D",
            "season_length": 1,
            "horizon": 2,
            "level": [90],
        }

        forecast_resp = client.post("/forecast", json=payload)

    assert mock_forecast.called
    assert forecast_resp.status_code == 200
    data = forecast_resp.json()
    assert data["forecast"] == [10.0, 11.0]
    assert data["timestamps"] == ["2024-01-05", "2024-01-06"]
    assert data["bounds"][0]["level"] == 90
    assert data["config"]["model_type"] == "auto_arima"

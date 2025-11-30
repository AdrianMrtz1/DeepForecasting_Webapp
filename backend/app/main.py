"""FastAPI application entrypoint for the Deep Forecasting backend."""

from __future__ import annotations

import logging
import json
import uuid
from typing import Iterable

import pandas as pd

from pathlib import Path
import time

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .models import (
    BacktestRequest,
    BacktestResponse,
    BatchForecastRequest,
    BatchForecastResponse,
    DatasetDetailResponse,
    DatasetInfo,
    DatasetsResponse,
    ForecastRequest,
    ForecastResponse,
    HealthResponse,
    SavedConfig,
    SavedConfigRequest,
    SavedConfigsResponse,
    TimeSeriesRecord,
    UploadResponse,
)
from .sample_data import list_datasets as list_sample_datasets
from .sample_data import load_dataset as load_sample_dataset
from .services.forecaster import NixtlaService
from .utils.data_processing import infer_frequency, validate_timeseries_payload

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)
load_dotenv()


def create_app() -> FastAPI:
    """Configure and return the FastAPI application."""
    app = FastAPI(
        title="Deep Forecasting API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://localhost:5177",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5177",
        ],
        allow_origin_regex=r"http://(localhost|127\\.0\\.0\\.1):\\d+",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    upload_store: dict[str, pd.DataFrame] = {}
    config_store_path = Path(__file__).resolve().parent.parent / "config_store.json"
    saved_configs: dict[str, SavedConfig] = _load_saved_configs(config_store_path)
    nixtla_service = NixtlaService()

    @app.get("/health", tags=["health"], response_model=HealthResponse)
    async def health() -> HealthResponse:
        """Simple liveness probe endpoint."""
        return HealthResponse(status="ok")

    @app.post(
        "/upload",
        tags=["data"],
        response_model=UploadResponse,
        status_code=status.HTTP_201_CREATED,
    )
    async def upload_timeseries(
        file: UploadFile = File(...),
        ds_col: str | None = Form(default=None, description="Column name for timestamps."),
        y_col: str | None = Form(default=None, description="Column name for target values."),
    ) -> UploadResponse:
        """Accept a CSV upload, validate it (with optional column mapping), and return a preview with an upload id."""
        try:
            ds_name = (ds_col or "ds").strip()
            y_name = (y_col or "y").strip()
            if ds_name.lower() == y_name.lower():
                raise ValueError("Timestamp and target columns must be different.")
            await file.seek(0)
            df = validate_timeseries_payload(
                file.file,
                chunksize=50_000,
                required_columns=(ds_name, y_name),
            )
        except ValueError as exc:
            logger.warning("Upload validation failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        except Exception as exc:  # pragma: no cover - defensive catch
            logger.exception("Unexpected error while processing upload")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to process upload.",
            ) from exc

        upload_id = str(uuid.uuid4())
        upload_store[upload_id] = df
        preview = _preview_records(df.head(5)["ds"].tolist(), df.head(5)["y"].tolist())
        detected_freq = infer_frequency(df["ds"])

        logger.info("Stored upload %s with %d rows", upload_id, len(df))
        return UploadResponse(
            upload_id=upload_id,
            preview=preview,
            rows=len(df),
            detected_freq=detected_freq,
        )

    @app.post(
        "/forecast",
        tags=["forecast"],
        response_model=ForecastResponse,
    )
    async def forecast(payload: ForecastRequest) -> ForecastResponse:
        """Run a forecast using either an uploaded dataset or inline records."""
        try:
            df = _resolve_payload_dataframe(payload, upload_store)
            result = nixtla_service.forecast(df, payload)
            return result
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()
            ) from exc
        except ValueError as exc:
            logger.warning("Forecast validation error: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        except HTTPException:
            raise
        except Exception as exc:  # pragma: no cover - defensive catch
            logger.exception("Forecast request failed")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Forecast failed. See server logs for details.",
            ) from exc

    @app.post(
        "/forecast/batch",
        tags=["forecast"],
        response_model=BatchForecastResponse,
    )
    async def forecast_batch(payload: BatchForecastRequest) -> BatchForecastResponse:
        """Run multiple configs on the same dataset and return a leaderboard."""
        try:
            df = _resolve_payload_dataframe(payload, upload_store)
            result = nixtla_service.forecast_many(df, payload)
            return result
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()
            ) from exc
        except ValueError as exc:
            logger.warning("Batch forecast validation error: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        except Exception as exc:  # pragma: no cover - defensive catch
            logger.exception("Batch forecast request failed")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Batch forecast failed. See server logs for details.",
            ) from exc

    @app.post(
        "/backtest",
        tags=["forecast"],
        response_model=BacktestResponse,
    )
    async def backtest(payload: BacktestRequest) -> BacktestResponse:
        """Run rolling-window backtests across one or more configs."""
        try:
            df = _resolve_payload_dataframe(payload, upload_store)
            result = nixtla_service.backtest(df, payload)
            return result
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()
            ) from exc
        except ValueError as exc:
            logger.warning("Backtest validation error: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        except Exception as exc:  # pragma: no cover - defensive catch
            logger.exception("Backtest request failed")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Backtest failed. See server logs for details.",
            ) from exc

    @app.get(
        "/datasets",
        tags=["data"],
        response_model=DatasetsResponse,
    )
    async def list_datasets() -> DatasetsResponse:
        """
        Return bundled datasets with preview rows and recommended settings.
        """
        try:
            datasets = list_sample_datasets()
        except Exception as exc:  # pragma: no cover - defensive log path
            logger.exception("Failed to load bundled datasets")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to load bundled datasets.",
            ) from exc

        return DatasetsResponse(datasets=datasets)

    @app.get(
        "/datasets/{dataset_id}",
        tags=["data"],
        response_model=DatasetDetailResponse,
    )
    async def get_dataset(dataset_id: str) -> DatasetDetailResponse:
        """Return the full records for a bundled dataset."""
        try:
            df, info = load_sample_dataset(dataset_id)
        except KeyError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset '{dataset_id}' was not found.",
            )
        except Exception as exc:  # pragma: no cover - defensive log path
            logger.exception("Failed to load bundled dataset %s", dataset_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to load bundled dataset.",
            ) from exc

        records = _preview_records(df["ds"].tolist(), df["y"].tolist())
        return DatasetDetailResponse(dataset=info, records=records)

    @app.get(
        "/configs",
        tags=["configs"],
        response_model=SavedConfigsResponse,
    )
    async def list_configs() -> SavedConfigsResponse:
        """Return saved configurations."""
        return SavedConfigsResponse(configs=list(saved_configs.values()))

    @app.get(
        "/configs/{config_id}",
        tags=["configs"],
        response_model=SavedConfig,
    )
    async def get_config(config_id: str) -> SavedConfig:
        """Retrieve a single saved configuration."""
        if config_id not in saved_configs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Config '{config_id}' was not found.",
            )
        return saved_configs[config_id]

    @app.post(
        "/configs",
        tags=["configs"],
        response_model=SavedConfig,
        status_code=status.HTTP_201_CREATED,
    )
    async def save_config(payload: SavedConfigRequest) -> SavedConfig:
        """Persist a configuration for reuse."""
        config_id = str(uuid.uuid4())
        saved = SavedConfig(
            id=config_id,
            name=payload.name,
            description=payload.description,
            config=payload.config,
            created_at=time.time(),
        )
        saved_configs[config_id] = saved
        _persist_saved_configs(config_store_path, saved_configs)
        return saved

    @app.delete(
        "/configs/{config_id}",
        tags=["configs"],
        status_code=status.HTTP_204_NO_CONTENT,
    )
    async def delete_config(config_id: str) -> Response:
        """Delete a saved configuration."""
        if config_id not in saved_configs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Config '{config_id}' was not found.",
            )
        saved_configs.pop(config_id, None)
        _persist_saved_configs(config_store_path, saved_configs)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return app



def _preview_records(ds_values: Iterable[object], y_values: Iterable[object]) -> list[TimeSeriesRecord]:
    """Build preview records with ISO-formatted timestamps."""
    preview: list[TimeSeriesRecord] = []
    for ds, y in zip(ds_values, y_values):
        ds_str = ds.isoformat() if hasattr(ds, "isoformat") else str(ds)
        preview.append(TimeSeriesRecord(ds=ds_str, y=float(y)))
    return preview


def _resolve_payload_dataframe(
    payload: ForecastRequest | BatchForecastRequest | BacktestRequest, store: dict[str, pd.DataFrame]
) -> pd.DataFrame:
    """Resolve the DataFrame backing a forecast request from upload_id or inline records."""
    if payload.upload_id:
        df = store.get(payload.upload_id)
        if df is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Upload '{payload.upload_id}' was not found or expired.",
            )
        return df.copy()

    records = payload.records or []
    return validate_timeseries_payload([record.model_dump() for record in records])


def _load_saved_configs(path: Path) -> dict[str, SavedConfig]:
    """Load saved configs from disk if available."""
    if not path.exists():
        return {}
    try:
        content = path.read_text(encoding="utf-8")
        if not content.strip():
            return {}
        data = json.loads(content)
        configs: dict[str, SavedConfig] = {}
        for item in data:
            saved = SavedConfig(**item)
            configs[saved.id] = saved
        return configs
    except Exception:
        return {}


def _persist_saved_configs(path: Path, configs: dict[str, SavedConfig]) -> None:
    """Persist configs to disk as JSON."""
    serializable = [cfg.model_dump() for cfg in configs.values()]
    path.write_text(json.dumps(serializable, indent=2), encoding="utf-8")


app = create_app()

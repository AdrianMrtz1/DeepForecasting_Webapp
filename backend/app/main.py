"""FastAPI application entrypoint for the Deep Forecasting backend."""

from __future__ import annotations

import logging
import os
import uuid
from typing import Iterable

import pandas as pd

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .models import (
    DatasetDetailResponse,
    DatasetInfo,
    DatasetsResponse,
    ForecastRequest,
    ForecastResponse,
    HealthResponse,
    TimeSeriesRecord,
    UploadResponse,
)
from .sample_data import list_datasets as list_sample_datasets
from .sample_data import load_dataset as load_sample_dataset
from .services.forecaster import NixtlaService
from .utils.data_processing import validate_timeseries_payload

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
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    upload_store: dict[str, pd.DataFrame] = {}
    nixtla_service = NixtlaService(api_key=os.getenv("NIXTLA_API_KEY"))

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
    async def upload_timeseries(file: UploadFile = File(...)) -> UploadResponse:
        """Accept a CSV upload, validate it, and return a preview with an upload id."""
        try:
            content = await file.read()
            df = validate_timeseries_payload(content)
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

        logger.info("Stored upload %s with %d rows", upload_id, len(df))
        return UploadResponse(upload_id=upload_id, preview=preview, rows=len(df))

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

    return app


app = create_app()


def _preview_records(ds_values: Iterable[object], y_values: Iterable[object]) -> list[TimeSeriesRecord]:
    """Build preview records with ISO-formatted timestamps."""
    preview: list[TimeSeriesRecord] = []
    for ds, y in zip(ds_values, y_values):
        ds_str = ds.isoformat() if hasattr(ds, "isoformat") else str(ds)
        preview.append(TimeSeriesRecord(ds=ds_str, y=float(y)))
    return preview


def _resolve_payload_dataframe(payload: ForecastRequest, store: dict[str, pd.DataFrame]) -> pd.DataFrame:
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

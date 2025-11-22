"""Bundled sample time-series datasets for the API and UI."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Tuple

import numpy as np
import pandas as pd

from .models import DatasetInfo, ModuleType, TimeSeriesRecord


@dataclass(frozen=True)
class SampleDataset:
    """Static metadata describing a bundled dataset."""

    id: str
    name: str
    description: str
    freq: str
    season_length: int
    recommended_horizon: int
    recommended_module: ModuleType | None
    recommended_models: List[str]
    loader: Callable[[], pd.DataFrame]


def _load_airpassengers() -> pd.DataFrame:
    """Classic airline passengers dataset (monthly, 1949-1960)."""
    passengers = [
        112, 118, 132, 129, 121, 135, 148, 148, 136, 119, 104, 118,
        115, 126, 141, 135, 125, 149, 170, 170, 158, 133, 114, 140,
        145, 150, 178, 163, 172, 178, 199, 199, 184, 162, 146, 166,
        171, 180, 193, 181, 183, 218, 230, 242, 209, 191, 172, 194,
        196, 196, 236, 235, 229, 243, 264, 272, 237, 211, 180, 201,
        204, 188, 235, 227, 234, 264, 302, 293, 259, 229, 203, 229,
        242, 233, 267, 269, 270, 315, 364, 347, 312, 274, 237, 278,
        284, 277, 317, 313, 318, 374, 413, 405, 355, 306, 271, 306,
        315, 301, 356, 348, 355, 422, 465, 467, 404, 347, 305, 336,
        340, 318, 362, 348, 363, 435, 491, 505, 404, 359, 310, 337,
        360, 342, 406, 396, 420, 472, 548, 559, 463, 407, 362, 405,
        417, 391, 419, 461, 472, 535, 622, 606, 508, 461, 390, 432,
    ]
    dates = pd.date_range(start="1949-01-01", periods=len(passengers), freq="MS")
    return pd.DataFrame({"ds": dates, "y": passengers})


def _load_energy_consumption() -> pd.DataFrame:
    """Synthetic daily household energy consumption with weekly pattern."""
    rng = np.random.default_rng(42)
    dates = pd.date_range(start="2023-01-01", periods=365, freq="D")

    base = 50.0
    trend = np.linspace(0, 10, len(dates))

    weekly_pattern = np.array([1.1, 1.15, 1.2, 1.15, 1.1, 0.8, 0.75])
    seasonality = np.resize(weekly_pattern, len(dates))

    noise = rng.normal(0, 5, len(dates))
    consumption = base + trend + (base * (seasonality - 1)) + noise

    return pd.DataFrame({"ds": dates, "y": consumption})


def _load_retail_sales() -> pd.DataFrame:
    """Synthetic weekly retail sales with holiday lift."""
    rng = np.random.default_rng(123)
    dates = pd.date_range(start="2021-01-03", periods=156, freq="W")

    base = 10000.0
    trend = np.linspace(0, 5000, len(dates))

    yearly_pattern = np.concatenate(
        [
            np.ones(39) * 0.9,
            np.ones(4) * 1.2,
            np.ones(5) * 1.0,
            np.ones(4) * 1.5,
        ]
    )
    seasonality = np.resize(yearly_pattern, len(dates))

    noise = rng.normal(0, 800, len(dates))
    sales = base + trend + (base * (seasonality - 1)) + noise

    return pd.DataFrame({"ds": dates, "y": sales})


def _load_temperature() -> pd.DataFrame:
    """Synthetic daily average temperature with yearly seasonality."""
    rng = np.random.default_rng(456)
    dates = pd.date_range(start="2022-01-01", periods=730, freq="D")

    base = 55.0
    days = np.arange(len(dates))
    seasonality = 25 * np.sin(2 * np.pi * days / 365 - np.pi / 2)
    noise = rng.normal(0, 5, len(dates))
    temperature = base + seasonality + noise

    return pd.DataFrame({"ds": dates, "y": temperature})


SAMPLE_DATASETS: Dict[str, SampleDataset] = {
    "airpassengers": SampleDataset(
        id="airpassengers",
        name="AirPassengers (Monthly, 1949-1960)",
        description="Classic airline passengers series with strong trend and yearly seasonality; great for StatsForecast/TimeGPT baselines.",
        freq="MS",
        season_length=12,
        recommended_horizon=12,
        recommended_module=ModuleType.statsforecast,
        recommended_models=["timegpt", "auto_arima"],
        loader=_load_airpassengers,
    ),
    "energy_daily": SampleDataset(
        id="energy_daily",
        name="Energy Consumption (Daily, 2023)",
        description="Synthetic household energy use with weekday/weekend pattern; solid for quick baselines and feature-driven ML when available.",
        freq="D",
        season_length=7,
        recommended_horizon=14,
        recommended_module=ModuleType.statsforecast,
        recommended_models=["auto_arima"],
        loader=_load_energy_consumption,
    ),
    "retail_weekly": SampleDataset(
        id="retail_weekly",
        name="Retail Sales (Weekly, 2021-2023)",
        description="Synthetic store sales with holiday lift; nice for trying hierarchical or promotion-aware approaches later.",
        freq="W",
        season_length=52,
        recommended_horizon=8,
        recommended_module=ModuleType.statsforecast,
        recommended_models=["auto_arima"],
        loader=_load_retail_sales,
    ),
    "temperature_daily": SampleDataset(
        id="temperature_daily",
        name="Temperature (Daily, 2022-2023)",
        description="Smooth daily temperatures with strong yearly seasonality; a friendly candidate for ML/Neural models once those paths are wired.",
        freq="D",
        season_length=365,
        recommended_horizon=30,
        recommended_module=ModuleType.statsforecast,
        recommended_models=["timegpt", "auto_arima"],
        loader=_load_temperature,
    ),
}


def _to_records(df: pd.DataFrame, limit: int | None = None) -> List[TimeSeriesRecord]:
    """Convert a dataframe into TimeSeriesRecord objects (optionally truncated)."""
    subset = df if limit is None else df.head(limit)
    records: List[TimeSeriesRecord] = []
    for _, row in subset.iterrows():
        ds_value = row["ds"]
        ds_str = ds_value.isoformat() if hasattr(ds_value, "isoformat") else str(ds_value)
        records.append(TimeSeriesRecord(ds=ds_str, y=float(row["y"])))
    return records


def _build_info(dataset: SampleDataset, df: pd.DataFrame, preview_rows: int) -> DatasetInfo:
    """Create DatasetInfo with preview rows for a dataset."""
    return DatasetInfo(
        id=dataset.id,
        name=dataset.name,
        description=dataset.description,
        rows=len(df),
        sample=_to_records(df, preview_rows),
        freq=dataset.freq,
        season_length=dataset.season_length,
        recommended_horizon=dataset.recommended_horizon,
        recommended_module=dataset.recommended_module,
        recommended_models=dataset.recommended_models or None,
    )


def list_datasets(preview_rows: int = 5) -> List[DatasetInfo]:
    """Return DatasetInfo objects for all bundled datasets."""
    datasets: List[DatasetInfo] = []
    for dataset in SAMPLE_DATASETS.values():
        df = dataset.loader()
        datasets.append(_build_info(dataset, df, preview_rows))
    return datasets


def load_dataset(dataset_id: str, preview_rows: int = 5) -> Tuple[pd.DataFrame, DatasetInfo]:
    """Load a bundled dataset by id, returning the dataframe and its metadata."""
    try:
        dataset = SAMPLE_DATASETS[dataset_id]
    except KeyError as exc:
        raise KeyError(f"Dataset '{dataset_id}' not found.") from exc

    df = dataset.loader()
    info = _build_info(dataset, df, preview_rows)
    return df, info

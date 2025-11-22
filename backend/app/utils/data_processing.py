"""Helpers for validating and preparing uploaded time-series data."""

from __future__ import annotations

from io import StringIO
from typing import Any, Iterable

import pandas as pd


def _to_dataframe(data: Any) -> pd.DataFrame:
    """Coerce supported input types into a DataFrame."""
    if isinstance(data, pd.DataFrame):
        return data.copy()
    if isinstance(data, (bytes, bytearray)):
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("Unable to decode CSV; please use UTF-8 encoding.") from exc
        return pd.read_csv(StringIO(text))
    if isinstance(data, str):
        return pd.read_csv(StringIO(data))
    if hasattr(data, "read"):
        content = data.read()
        if isinstance(content, bytes):
            return _to_dataframe(content)
        return pd.read_csv(StringIO(str(content)))
    if isinstance(data, Iterable):
        try:
            return pd.DataFrame(list(data))
        except Exception as exc:  # pragma: no cover - defensive for unexpected payloads
            raise ValueError("Unable to convert records into a DataFrame.") from exc
    raise TypeError("Unsupported data type for time-series payload.")


def _format_examples(values: Iterable[Any], limit: int = 3) -> str:
    """Render a short preview of invalid values for error messages."""
    preview = []
    for idx, value in enumerate(values):
        if idx >= limit:
            break
        preview.append(repr(value))
    return ", ".join(preview)


def validate_timeseries_payload(
    data: Any,
    *,
    required_columns: tuple[str, str] = ("ds", "y"),
    sort: bool = True,
) -> pd.DataFrame:
    """
    Validate uploaded time-series data and return a cleaned DataFrame.

    Ensures the presence of `ds` and `y` columns, parses dates, enforces numeric
    targets, rejects invalid rows with clear errors, and sorts chronologically
    when requested.
    """
    df = _to_dataframe(data)
    if df.empty:
        raise ValueError("No rows found in the uploaded data.")

    normalized = {str(col).strip().lower(): col for col in df.columns}
    missing = [col for col in required_columns if col not in normalized]
    if missing:
        found = ", ".join(df.columns)
        raise ValueError(f"Missing required columns: {', '.join(missing)}. Found: {found}.")

    canonical = {normalized["ds"]: "ds", normalized["y"]: "y"}
    df = df.rename(columns=canonical)[["ds", "y"]].copy()

    raw_ds = df["ds"]
    parsed_ds = pd.to_datetime(raw_ds, errors="coerce", utc=False)
    invalid_ds_mask = parsed_ds.isna()
    if invalid_ds_mask.any():
        invalid_examples = _format_examples(raw_ds[invalid_ds_mask])
        count = int(invalid_ds_mask.sum())
        raise ValueError(
            f"Found {count} rows with invalid or missing timestamps in 'ds' "
            f"(examples: {invalid_examples}). Use ISO-8601 date or datetime strings."
        )

    raw_y = df["y"]
    numeric_y = pd.to_numeric(raw_y, errors="coerce")
    invalid_y_mask = numeric_y.isna()
    if invalid_y_mask.any():
        invalid_examples = _format_examples(raw_y[invalid_y_mask])
        count = int(invalid_y_mask.sum())
        raise ValueError(
            f"Found {count} rows with non-numeric or missing values in 'y' "
            f"(examples: {invalid_examples}). Targets must be numeric."
        )

    cleaned = pd.DataFrame({"ds": parsed_ds, "y": numeric_y.astype(float)})

    if cleaned["ds"].duplicated().any():
        duplicate_values = cleaned.loc[cleaned["ds"].duplicated(), "ds"].dt.strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        raise ValueError(
            "Duplicate timestamps detected in 'ds' "
            f"(examples: {_format_examples(duplicate_values)}). "
            "Ensure each timestamp is unique."
        )

    if sort and not cleaned["ds"].is_monotonic_increasing:
        cleaned = cleaned.sort_values("ds").reset_index(drop=True)
    else:
        cleaned = cleaned.reset_index(drop=True)

    if len(cleaned) < 2:
        raise ValueError("At least two observations are required for forecasting.")

    return cleaned

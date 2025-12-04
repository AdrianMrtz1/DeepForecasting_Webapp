"""Helpers for validating and preparing uploaded time-series data."""

from __future__ import annotations

from io import StringIO, TextIOWrapper
from typing import Any, Iterable
import warnings

import pandas as pd


def _to_dataframe(data: Any, chunksize: int | None = None) -> pd.DataFrame:
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
        try:
            if hasattr(data, "seek"):
                data.seek(0)
            stream = data
            if not isinstance(stream, (TextIOWrapper, StringIO)):
                stream = TextIOWrapper(data, encoding="utf-8")

            reader = pd.read_csv(stream, chunksize=chunksize) if chunksize else pd.read_csv(stream)
            if chunksize:
                chunks = list(reader)
                if not chunks:
                    return pd.DataFrame()
                return pd.concat(chunks, ignore_index=True)
            return reader
        except UnicodeDecodeError as exc:
            raise ValueError("Unable to decode CSV; please use UTF-8 encoding.") from exc
        except Exception:
            if hasattr(data, "seek"):
                data.seek(0)
            content = data.read()
            if isinstance(content, bytes):
                return _to_dataframe(content, chunksize=chunksize)
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


def _score_timestamp_column(series: pd.Series) -> float:
    """Return the fraction of values that can be parsed as datetimes."""
    if series.empty:
        return 0.0
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="Could not infer format",
            category=UserWarning,
        )
        parsed = pd.to_datetime(series, errors="coerce")
    return float(parsed.notna().sum()) / len(series)


def _score_numeric_column(series: pd.Series) -> float:
    """Return the fraction of values that can be parsed as numeric."""
    if series.empty:
        return 0.0
    numeric = pd.to_numeric(series, errors="coerce")
    return float(numeric.notna().sum()) / len(series)


def _guess_columns(
    df: pd.DataFrame,
    *,
    required: tuple[str, str],
    normalized: dict[str, str],
    auto_detect: bool = True,
) -> tuple[dict[str, str], list[str]]:
    """
    Resolve required columns to actual names, optionally inferring sensible defaults.

    Returns a mapping of required name -> source name and a list of still-missing columns.
    """
    mapping: dict[str, str] = {}
    for col in required:
        if col in normalized:
            mapping[col] = normalized[col]

    missing = [col for col in required if col not in mapping]
    if not missing or not auto_detect:
        return mapping, missing

    # Prefer explicit aliases before scoring columns.
    timestamp_aliases = ("ds", "date", "datetime", "timestamp", "time", "day", "month", "quarter", "period")
    target_aliases = (
        "y",
        "value",
        "target",
        "amount",
        "metric",
        "sales",
        "volume",
        "count",
        "passengers",
        "realgdp",
    )

    used = set(mapping.values())
    if required[0] in missing:
        for alias in timestamp_aliases:
            if alias in normalized and normalized[alias] not in used:
                mapping[required[0]] = normalized[alias]
                used.add(normalized[alias])
                break
        else:
            best_col, best_score = None, 0.0
            for col in df.columns:
                if col in used:
                    continue
                score = _score_timestamp_column(df[col])
                if score > best_score:
                    best_col, best_score = col, score
            if best_col and best_score >= 0.6:
                mapping[required[0]] = best_col
                used.add(best_col)

    if required[1] in missing:
        for alias in target_aliases:
            if alias in normalized and normalized[alias] not in used:
                mapping[required[1]] = normalized[alias]
                used.add(normalized[alias])
                break
        else:
            best_col, best_score = None, 0.0
            for col in df.columns:
                if col in used:
                    continue
                score = _score_numeric_column(df[col])
                if score > best_score:
                    best_col, best_score = col, score
            if best_col and best_score >= 0.6:
                mapping[required[1]] = best_col
                used.add(best_col)

    missing = [col for col in required if col not in mapping]
    return mapping, missing


def _parse_timestamps(raw_ds: pd.Series) -> pd.Series:
    """Parse timestamps allowing ISO-8601 first with a few common fallbacks."""
    parsed = pd.to_datetime(raw_ds, format="ISO8601", errors="coerce", utc=False)
    if parsed.notna().all():
        return parsed

    # Accept a handful of predictable non-ISO formats often seen in uploads (e.g., quarterly data).
    fallback_formats = ("%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y", "%m-%d-%y", "%Y/%m/%d")
    for fmt in fallback_formats:
        missing_mask = parsed.isna()
        if not missing_mask.any():
            break
        parsed.loc[missing_mask] = pd.to_datetime(
            raw_ds[missing_mask], format=fmt, errors="coerce", utc=False
        )

    return parsed


def validate_timeseries_payload(
    data: Any,
    *,
    required_columns: tuple[str, str] = ("ds", "y"),
    sort: bool = True,
    chunksize: int | None = None,
    auto_detect_columns: bool = True,
) -> pd.DataFrame:
    """
    Validate uploaded time-series data and return a cleaned DataFrame.

    Ensures the presence of `ds` and `y` columns, parses dates, enforces numeric
    targets, rejects invalid rows with clear errors, and sorts chronologically
    when requested.
    """
    df = _to_dataframe(data, chunksize=chunksize)
    if df.empty:
        raise ValueError("No rows found in the uploaded data.")

    normalized = {str(col).strip().lower(): col for col in df.columns}

    # Normalize required column names to lower-case to match the normalized map.
    required = tuple(col.strip().lower() for col in required_columns)
    if required[0] == required[1]:
        raise ValueError("Timestamp and target columns must be different.")

    mapping, missing = _guess_columns(df, required=required, normalized=normalized, auto_detect=auto_detect_columns)
    if missing:
        found = ", ".join(df.columns)
        raise ValueError(
            f"Missing required columns: {', '.join(missing)}. Found: {found}. "
            "Please provide column names for timestamp and target."
        )

    ds_source, y_source = (mapping[required[0]], mapping[required[1]])
    canonical = {ds_source: "ds", y_source: "y"}
    df = df.rename(columns=canonical)[["ds", "y"]].copy()

    raw_ds = df["ds"]
    parsed_ds = _parse_timestamps(raw_ds)
    invalid_ds_mask = parsed_ds.isna()
    if invalid_ds_mask.any():
        invalid_examples = _format_examples(raw_ds[invalid_ds_mask])
        count = int(invalid_ds_mask.sum())
        raise ValueError(
            f"Found {count} rows with invalid or missing timestamps in 'ds' "
            f"(examples: {invalid_examples}). Use ISO-8601 date or datetime strings "
            "or standard MM/DD/YYYY dates."
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


def infer_frequency(series: pd.Series) -> str | None:
    """Attempt to infer a pandas frequency string from a timestamp series."""
    if series.empty:
        return None
    inferred = pd.infer_freq(series)
    if inferred:
        return inferred

    diffs = series.sort_values().diff().dropna()
    if diffs.empty:
        return None
    most_common = diffs.mode().iloc[0]
    seconds = most_common.total_seconds()
    mapping = {
        3600: "H",
        86400: "D",
        7 * 86400: "W",
        30 * 86400: "MS",
    }
    return mapping.get(int(seconds), None)


def apply_missing_strategy(df: pd.DataFrame, strategy: str) -> pd.DataFrame:
    """Fill or drop missing values according to the requested strategy."""
    if strategy == "none":
        return df
    if strategy == "drop":
        return df.dropna(subset=["y"]).reset_index(drop=True)
    if strategy == "ffill":
        return df.ffill().reset_index(drop=True)
    if strategy == "interpolate":
        filled = df.copy()
        filled["y"] = filled["y"].interpolate(limit_direction="both")
        return filled
    return df


def filter_date_range(df: pd.DataFrame, start: str | None, end: str | None) -> pd.DataFrame:
    """Filter a DataFrame to an inclusive date range when bounds are provided."""
    if start:
        start_ts = pd.to_datetime(start, errors="coerce")
        if pd.isna(start_ts):
            raise ValueError("Invalid date_start; must be ISO-8601 parseable.")
        df = df[df["ds"] >= start_ts]
    if end:
        end_ts = pd.to_datetime(end, errors="coerce")
        if pd.isna(end_ts):
            raise ValueError("Invalid date_end; must be ISO-8601 parseable.")
        df = df[df["ds"] <= end_ts]
    return df.reset_index(drop=True)

from __future__ import annotations

from io import BytesIO

import pandas as pd
import pytest

from app.utils.data_processing import validate_timeseries_payload


def test_validate_timeseries_payload_parses_and_sorts_csv() -> None:
    csv_payload = "ds,y\n2024-01-02,2\n2024-01-01,1\n"

    df = validate_timeseries_payload(csv_payload)

    assert list(df["y"]) == [1.0, 2.0]
    assert df["ds"].is_monotonic_increasing
    assert df["ds"].iloc[0] == pd.Timestamp("2024-01-01")


def test_validate_timeseries_payload_requires_columns() -> None:
    with pytest.raises(ValueError, match="Missing required columns"):
        validate_timeseries_payload("foo,bar\nx,1\ny,2\n", auto_detect_columns=True)


def test_validate_timeseries_payload_rejects_invalid_timestamps() -> None:
    payload = "ds,y\nnot-a-date,1\n2024-01-02,2\n"

    with pytest.raises(ValueError, match="invalid or missing timestamps"):
        validate_timeseries_payload(payload)


def test_validate_timeseries_payload_rejects_non_numeric_targets() -> None:
    payload = "ds,y\n2024-01-01,abc\n2024-01-02,2\n"

    with pytest.raises(ValueError, match="non-numeric or missing values in 'y'"):
        validate_timeseries_payload(payload)


def test_validate_timeseries_payload_rejects_duplicates() -> None:
    payload = "ds,y\n2024-01-01,1\n2024-01-01,2\n"

    with pytest.raises(ValueError, match="Duplicate timestamps detected"):
        validate_timeseries_payload(payload)


def test_validate_timeseries_payload_needs_multiple_rows() -> None:
    payload = "ds,y\n2024-01-01,1\n"

    with pytest.raises(ValueError, match="At least two observations"):
        validate_timeseries_payload(payload)


def test_validate_timeseries_payload_streams_file_like() -> None:
    payload = BytesIO(b"ds,y\n2024-01-01,1\n2024-01-02,2\n")

    df = validate_timeseries_payload(payload, chunksize=1)

    assert len(df) == 2
    assert df["y"].tolist() == [1.0, 2.0]


def test_validate_timeseries_payload_accepts_common_us_dates() -> None:
    payload = "ds,y\n3/31/1959,1\n6/30/1959,2\n"

    df = validate_timeseries_payload(payload)

    assert df["ds"].tolist() == [pd.Timestamp("1959-03-31"), pd.Timestamp("1959-06-30")]


def test_validate_timeseries_payload_auto_maps_common_columns() -> None:
    payload = "quarter,realgdp,realcons\n1959-03-31,2710.349,1707.4\n1959-06-30,2778.801,1733.7\n"

    df = validate_timeseries_payload(payload)

    assert list(df.columns) == ["ds", "y"]
    assert df["ds"].iloc[0] == pd.Timestamp("1959-03-31")
    assert df["y"].iloc[1] == pytest.approx(2778.801)

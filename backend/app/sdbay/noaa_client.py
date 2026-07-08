"""NOAA CO-OPS Data API client: water levels and tidal-current predictions.

All requests use ``time_zone=gmt`` so timestamps are unambiguous; conversion
to local America/Los_Angeles clock time (with correct PDT/PST) happens only
at display time in :mod:`sdbay.outputs`. Every raw HTTP response is cached
to ``data/raw/`` alongside the request parameters, the fetch timestamp, and
the source URL, so a re-run does not re-hit the network and the provenance
of every forcing/validation series is auditable.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import pandas as pd
import requests

API_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
APPLICATION = "SDBay_Tidal_Current_Estimate"

DEFAULT_CACHE_ROOT = Path("data/raw")


class NoaaApiError(RuntimeError):
    pass


def _cache_dir(subdir: str, cache_root: Path) -> Path:
    d = cache_root / subdir
    d.mkdir(parents=True, exist_ok=True)
    return d


def _cache_key(params: dict[str, Any]) -> str:
    blob = json.dumps(params, sort_keys=True)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:16]


def _get_cached_or_fetch(params: dict[str, Any], subdir: str, cache_root: Path, use_cache: bool = True) -> dict[str, Any]:
    cache_dir = _cache_dir(subdir, cache_root)
    key = _cache_key(params)
    cache_file = cache_dir / f"{params.get('station', 'unknown')}_{params.get('product', 'p')}_{key}.json"

    if use_cache and cache_file.exists():
        return json.loads(cache_file.read_text())["payload"]

    response = requests.get(API_URL, params=params, timeout=30)
    response.raise_for_status()
    try:
        payload = response.json()
    except ValueError as exc:
        raise NoaaApiError(f"NOAA returned a non-JSON response for {params}") from exc

    if isinstance(payload, dict) and "error" in payload:
        error = payload["error"]
        message = error.get("message", str(error)) if isinstance(error, dict) else str(error)
        raise NoaaApiError(f"NOAA API error for station {params.get('station')}: {message}")

    record = {
        "request_url": response.url,
        "fetched_at_utc": datetime.now(timezone.utc).isoformat(),
        "params": params,
        "payload": payload,
    }
    cache_file.write_text(json.dumps(record, indent=2))
    return payload


def fetch_water_level(
    station: str,
    begin: datetime,
    end: datetime,
    product: Literal["water_level", "predictions"] = "predictions",
    datum: str = "MLLW",
    interval: str = "6",
    cache_root: Path = DEFAULT_CACHE_ROOT,
    use_cache: bool = True,
) -> pd.DataFrame:
    """Fetch NOAA water level (observed or predicted) as a UTC-indexed series in meters."""
    begin_utc = begin.astimezone(timezone.utc)
    end_utc = end.astimezone(timezone.utc)
    params = {
        "product": product,
        "application": APPLICATION,
        "begin_date": begin_utc.strftime("%Y%m%d %H:%M"),
        "end_date": end_utc.strftime("%Y%m%d %H:%M"),
        "datum": datum,
        "station": station,
        "time_zone": "gmt",
        "units": "metric",
        "interval": interval,
        "format": "json",
    }
    payload = _get_cached_or_fetch(params, "noaa_water_level", cache_root, use_cache)
    df = parse_water_level_payload(payload, product)
    if df.empty:
        raise NoaaApiError(f"NOAA returned no {product} rows for station {station} ({begin_utc}..{end_utc})")
    return df


def parse_water_level_payload(payload: dict[str, Any], product: str) -> pd.DataFrame:
    """Pure parsing step for a NOAA water_level/predictions JSON payload."""
    key = "predictions" if product == "predictions" else "data"
    rows = payload.get(key, [])
    if not rows:
        return pd.DataFrame(columns=["water_level_m"]).set_index(pd.DatetimeIndex([], name="time_utc"))

    times = pd.to_datetime([r["t"] for r in rows], utc=True)
    values = pd.to_numeric([r["v"] for r in rows], errors="coerce")
    df = pd.DataFrame({"time_utc": times, "water_level_m": values}).dropna()
    df = df.set_index("time_utc").sort_index()
    return df


def extract_current_prediction_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Return NOAA current-prediction records from either JSON envelope shape."""
    root = payload.get("current_predictions")
    if isinstance(root, list):
        rows = root
    elif isinstance(root, dict):
        rows = root.get("cp") or root.get("data") or root.get("predictions") or []
    else:
        rows = []
    if not isinstance(rows, list) or not rows or not all(isinstance(r, dict) for r in rows):
        raise NoaaApiError(
            f"NOAA returned no usable current-prediction rows. Top-level keys: {list(payload)}"
        )
    return rows


def _as_float(value: Any) -> float | None:
    try:
        return None if value in (None, "", "null") else float(value)
    except (TypeError, ValueError):
        return None


def _normalize_current_row(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize a NOAA currents_predictions row requested with units=metric.

    With ``units=metric`` NOAA documents its current-prediction payload as
    "meters, cm/s": ``Velocity_Major`` (harmonic-station rows) and ``Speed``
    (subordinate max/slack event rows) are both in cm/s, not knots. Mixing
    this up silently produces current speeds ~20x too large.
    """
    event_type = str(row.get("Type", "")).strip().lower()
    major_cms = _as_float(row.get("Velocity_Major"))
    speed_cms = _as_float(row.get("Speed"))

    if event_type in {"flood", "ebb", "slack"}:
        phase = event_type
    elif major_cms is None:
        phase = "speed_direction"
    elif abs(major_cms) < 1e-9:
        phase = "slack"
    else:
        phase = "flood" if major_cms > 0 else "ebb"

    if speed_cms is None:
        speed_cms = abs(major_cms) if major_cms is not None else 0.0
    signed_speed_cms = major_cms if major_cms is not None else (speed_cms if phase != "ebb" else -abs(speed_cms))

    if "Direction" in row and row.get("Direction") not in (None, ""):
        direction = _as_float(row.get("Direction"))
    elif phase == "flood":
        direction = _as_float(row.get("meanFloodDir"))
    elif phase == "ebb":
        direction = _as_float(row.get("meanEbbDir"))
    else:
        direction = None

    return {
        "time_utc": row.get("Time", ""),
        "event": phase,
        "speed_mps": float(speed_cms) / 100.0,
        "signed_speed_mps": float(signed_speed_cms) / 100.0,
        "direction_deg_true": direction,
        "bin": row.get("Bin", ""),
        "depth_ft": row.get("Depth", ""),
    }


def fetch_current_predictions(
    station: str,
    begin: datetime,
    hours: float,
    interval: str = "6",
    cache_root: Path = DEFAULT_CACHE_ROOT,
    use_cache: bool = True,
) -> pd.DataFrame:
    """Fetch NOAA tidal-current predictions for `station` over `hours` starting at `begin`.

    Handles both NOAA response shapes: harmonic stations return fixed-interval
    speed/direction rows; subordinate stations (like PCT0031/PCT0061) return
    max-flood / slack / max-ebb event rows only, so a fixed ``interval``
    request is retried as ``interval=max_slack`` if it fails.
    """
    begin_utc = begin.astimezone(timezone.utc)
    params = {
        "begin_date": begin_utc.strftime("%Y%m%d %H:%M"),
        "range": str(int(round(hours))),
        "station": station,
        "product": "currents_predictions",
        "time_zone": "gmt",
        "interval": interval,
        "units": "metric",
        "application": APPLICATION,
        "format": "json",
        "bin": "1",
    }
    try:
        payload = _get_cached_or_fetch(params, "noaa_currents", cache_root, use_cache)
        rows = extract_current_prediction_rows(payload)
        used_interval = interval
    except NoaaApiError:
        params = {**params, "interval": "max_slack"}
        payload = _get_cached_or_fetch(params, "noaa_currents", cache_root, use_cache)
        rows = extract_current_prediction_rows(payload)
        used_interval = "max_slack"

    normalized = [_normalize_current_row(r) for r in rows]
    df = pd.DataFrame(normalized)
    df["time_utc"] = pd.to_datetime(df["time_utc"], utc=True)
    df = df.set_index("time_utc").sort_index()
    df.attrs["interval"] = used_interval
    df.attrs["station"] = station
    return df

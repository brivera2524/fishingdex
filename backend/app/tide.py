"""San Diego tide lookups against NOAA CO-OPS station 9410170.

These are astronomical predictions, not observations, so they're computed
identically for past or future timestamps — the same call that backfills an
old catch also works for one logged just now.
"""

from datetime import datetime, timedelta

import httpx

STATION_ID = "9410170"
NOAA_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"


class TideUnavailable(Exception):
    """NOAA couldn't be reached, or didn't return usable data for this time."""


def _format_noaa_datetime(dt: datetime) -> str:
    return dt.strftime("%Y%m%d %H:%M")


def _get(params: dict) -> dict:
    try:
        resp = httpx.get(NOAA_BASE, params=params, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise TideUnavailable(str(exc)) from exc


def _local_naive(dt: datetime) -> datetime:
    # caught_at is stored UTC-aware, but NOAA wants the station's local time
    # (lst_ldt) and this app only ever deals with San Diego/Pacific — same
    # simplifying assumption the frontend tide badge makes, so we just drop
    # tzinfo rather than doing a real UTC->Pacific conversion.
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def get_tide_at(caught_at: datetime) -> tuple[float, str]:
    """Returns (height_ft, direction) for San Diego at the given moment.

    Raises TideUnavailable if NOAA can't be reached or has no data for
    this time (e.g. far enough in the future that predictions aren't
    published yet).
    """
    local_time = _local_naive(caught_at)

    hilo_data = _get(
        {
            "product": "predictions",
            "datum": "MLLW",
            "station": STATION_ID,
            "time_zone": "lst_ldt",
            "units": "english",
            "format": "json",
            "interval": "hilo",
            "begin_date": _format_noaa_datetime(local_time - timedelta(hours=12)),
            "range": 24,
        }
    )
    events = sorted(
        (
            {"time": datetime.strptime(p["t"], "%Y-%m-%d %H:%M"), "type": p["type"]}
            for p in hilo_data.get("predictions", [])
        ),
        key=lambda e: e["time"],
    )
    next_event = next((e for e in events if e["time"] > local_time), None)
    if next_event is None:
        raise TideUnavailable("No upcoming high/low found for this time")
    direction = "rising" if next_event["type"] == "H" else "falling"

    height_data = _get(
        {
            "product": "predictions",
            "datum": "MLLW",
            "station": STATION_ID,
            "time_zone": "lst_ldt",
            "units": "english",
            "format": "json",
            "interval": "6",
            "begin_date": _format_noaa_datetime(local_time - timedelta(hours=1)),
            "range": 2,
        }
    )
    points = height_data.get("predictions", [])
    if not points:
        raise TideUnavailable("No height prediction found for this time")
    closest = min(
        points,
        key=lambda p: abs((datetime.strptime(p["t"], "%Y-%m-%d %H:%M") - local_time).total_seconds()),
    )
    return round(float(closest["v"]), 2), direction

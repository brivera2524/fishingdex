"""Simulated San Diego Bay current field for the Map page's current overlay.

app/ocean_current.py serves real observed HFRadar data, but that product has
no usable resolution *inside* San Diego Bay (see its docstring) — it only
covers open coastal water. This module fills that gap with a physics-based
estimate: a 2D depth-averaged tidal current solver (vendored in app/sdbay/,
originally from the standalone SD-current-sim project) forced by real NOAA
tide predictions at the bay entrance, on real NOAA bathymetry.

This is a genuine simulation, not a measurement — see app/sdbay/'s
DISCLAIMER and this module's own confidence notes below. It should be
presented to users as an estimate ("modeled," not "observed").

Confidence (see the source project's docs/LIMITATIONS.md for detail):
- Flood/ebb direction and bulk channel speed: well-validated against real
  NOAA current stations (correlation ~0.9+).
- Absolute peak speed at fast, narrow features: the model underestimates it
  somewhat. Treat modeled speed as relative/qualitative, not precise.
- No wind, swell, or wake — tide-only.

A full spin-up + short forecast run takes real wall-clock minutes (the
solver has to integrate roughly a day and a half of simulated time to clear
initial-condition transients), so this runs periodically in a background
task rather than per-request, serving the most recent completed run's frame
nearest to "now" out of an in-memory cache.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from pyproj import Transformer

from app.sdbay.config import load_config
from app.sdbay.grid import GridData, load_grid
from app.sdbay.simulate import MapFrame, SimulationResult, run_simulation

logger = logging.getLogger(__name__)

SIM_DATA_DIR = Path(__file__).resolve().parent / "sim_data"
GRID_DIR = SIM_DATA_DIR / "grid_20m"
CONFIG_PATH = SIM_DATA_DIR / "model.yaml"

# Output lon/lat grid served to the frontend — coarser than the 20m solver
# grid (~35m near this latitude), which is plenty for a flow-line
# visualization and keeps the served payload small. Covers the bay interior
# only; the HFRadar layer already covers the open coastal water outside it.
# Bounds chosen to match the solver grid's real wet-cell extent (verified by
# reprojecting wet_mask's row/col bounding box to lon/lat) plus a small
# margin — the solver grid runs lon -117.240..-117.100, lat 32.603..32.741.
OUT_LAT_MIN, OUT_LAT_MAX = 32.60, 32.745
OUT_LON_MIN, OUT_LON_MAX = -117.245, -117.095
OUT_NY, OUT_NX = 230, 230

SPINUP_HOURS = 30.0
FORECAST_HOURS = 6.0
MAP_FRAME_MINUTES = 10.0
# Regenerate well before the forecast window runs out, so there's always a
# frame within a few minutes of "now."
REFRESH_INTERVAL_SECONDS = 4 * 60 * 60

_WGS84_TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:26911", always_xy=True)

_state_lock = asyncio.Lock()
_state: dict = {
    "status": "warming_up",  # warming_up | ready | error
    "records": None,
    "generated_at": None,
    "sim_time_utc": None,
    "error": None,
}

_grid: GridData | None = None
_remap_cache: tuple[np.ndarray, np.ndarray, np.ndarray] | None = None
_background_task: asyncio.Task | None = None


def get_state() -> dict:
    return _state


def _load_grid_once() -> GridData:
    global _grid
    if _grid is None:
        _grid = load_grid(GRID_DIR)
    return _grid


def _build_remap_indices(grid: GridData) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """For every cell of the served lon/lat grid, find the nearest cell of
    the solver's grid (which is regular in UTM meters, not lon/lat degrees —
    this is a one-time nearest-neighbor resample, not a direct index
    formula). Cached after the first call since neither grid changes shape.
    """
    global _remap_cache
    if _remap_cache is not None:
        return _remap_cache

    lats = np.linspace(OUT_LAT_MAX, OUT_LAT_MIN, OUT_NY)  # row 0 = north, matches leaflet-velocity's la1
    lons = np.linspace(OUT_LON_MIN, OUT_LON_MAX, OUT_NX)
    lon_grid, lat_grid = np.meshgrid(lons, lats)
    x, y = _WGS84_TO_UTM.transform(lon_grid.ravel(), lat_grid.ravel())
    a, b, c, d, e, f = grid.transform
    col = np.round((np.asarray(x) - c) / a).astype(int)
    row = np.round((np.asarray(y) - f) / e).astype(int)

    ny, nx = grid.wet_mask.shape
    in_bounds = (row >= 0) & (row < ny) & (col >= 0) & (col < nx)
    row_c = np.clip(row, 0, ny - 1).reshape(OUT_NY, OUT_NX)
    col_c = np.clip(col, 0, nx - 1).reshape(OUT_NY, OUT_NX)
    valid = (in_bounds.reshape(OUT_NY, OUT_NX)) & grid.wet_mask[row_c, col_c]

    _remap_cache = (row_c, col_c, valid)
    return _remap_cache


def _nearest_frame(result: SimulationResult, target_time: datetime) -> MapFrame:
    return min(
        result.map_frames,
        key=lambda frame: abs((frame.time_utc.to_pydatetime() - target_time).total_seconds()),
    )


def _remap_to_records(grid: GridData, frame: MapFrame) -> list[dict]:
    row_idx, col_idx, valid = _build_remap_indices(grid)
    u = np.where(valid, frame.u[row_idx, col_idx], np.nan)
    v = np.where(valid, frame.v[row_idx, col_idx], np.nan)

    # None -> JSON null -> the frontend converts back to NaN, which
    # leaflet-velocity already treats as "no data, don't draw here."
    u_flat = [None if not np.isfinite(val) else float(val) for val in u.ravel()]
    v_flat = [None if not np.isfinite(val) else float(val) for val in v.ravel()]

    header_common = {
        "nx": OUT_NX,
        "ny": OUT_NY,
        "lo1": OUT_LON_MIN,
        "la1": OUT_LAT_MAX,
        "lo2": OUT_LON_MAX,
        "la2": OUT_LAT_MIN,
        "dx": (OUT_LON_MAX - OUT_LON_MIN) / (OUT_NX - 1),
        "dy": (OUT_LAT_MAX - OUT_LAT_MIN) / (OUT_NY - 1),
        "refTime": frame.time_utc.isoformat(),
        "forecastTime": 0,
    }
    return [
        {"header": {**header_common, "parameterCategory": 2, "parameterNumber": 2}, "data": u_flat},
        {"header": {**header_common, "parameterCategory": 2, "parameterNumber": 3}, "data": v_flat},
    ]


def _run_forecast_sync() -> tuple[list[dict], datetime]:
    """Blocking, CPU-heavy: run on a worker thread via asyncio.to_thread,
    never on the event loop."""
    cfg = load_config(CONFIG_PATH)
    grid = _load_grid_once()
    now = datetime.now(timezone.utc)
    result = run_simulation(
        cfg,
        grid,
        run_start_utc=now,
        spinup_hours=SPINUP_HOURS,
        forecast_hours=FORECAST_HOURS,
        map_frame_minutes=MAP_FRAME_MINUTES,
    )
    frame = _nearest_frame(result, now)
    records = _remap_to_records(grid, frame)
    return records, frame.time_utc.to_pydatetime()


async def _refresh_loop() -> None:
    while True:
        try:
            logger.info("ocean_sim: starting bay current forecast run")
            t0 = time.monotonic()
            records, sim_time_utc = await asyncio.to_thread(_run_forecast_sync)
            async with _state_lock:
                _state.update(
                    status="ready",
                    records=records,
                    generated_at=datetime.now(timezone.utc),
                    sim_time_utc=sim_time_utc,
                    error=None,
                )
            logger.info("ocean_sim: forecast run complete in %.0fs", time.monotonic() - t0)
        except Exception as exc:  # noqa: BLE001 - a single bad run must not kill the refresh loop
            logger.exception("ocean_sim: forecast run failed")
            async with _state_lock:
                _state["status"] = "error"
                _state["error"] = str(exc)
        await asyncio.sleep(REFRESH_INTERVAL_SECONDS)


def start_background_refresh() -> None:
    global _background_task
    if _background_task is None:
        _background_task = asyncio.create_task(_refresh_loop())

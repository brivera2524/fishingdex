"""Run the barotropic model: spin-up + forecast, producing station time
series and periodic full-bay snapshots.

No tidal elevation is ever imposed on an interior wet cell; the only
forcing is ``BoundaryForcing`` applied through the solver's Flather open
boundary (see :mod:`sdbay.solver`).
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Callable

import numpy as np
import pandas as pd

from app.sdbay.config import ModelConfig
from app.sdbay.forcing import BoundaryForcing, build_boundary_forcing
from app.sdbay.grid import GridData
from app.sdbay.solver import BarotropicTideModel, TideConfig
from app.sdbay.stations import ALL_STATIONS, Station


@dataclass
class MapFrame:
    time_utc: pd.Timestamp
    eta: np.ndarray
    u: np.ndarray
    v: np.ndarray
    speed: np.ndarray


@dataclass
class SimulationResult:
    run_start_utc: datetime
    spinup_hours: float
    forecast_hours: float
    station_series: dict[str, pd.DataFrame]
    map_frames: list[MapFrame]
    grid: GridData
    boundary_forcing: BoundaryForcing


def _station_rowcol(grid: GridData, station: Station) -> tuple[int, int] | None:
    row, col = grid.lonlat_to_rowcol(station.lon, station.lat)
    return grid.nearest_wet_cell(row, col)


def run_simulation(
    cfg: ModelConfig,
    grid: GridData,
    run_start_utc: datetime,
    spinup_hours: float | None = None,
    forecast_hours: float | None = None,
    station_output_minutes: int | None = None,
    map_frame_minutes: float = 60.0,
    stations: list[Station] = ALL_STATIONS,
    progress_every_s: float | None = None,
    on_frame: Callable[[MapFrame], None] | None = None,
    keep_frames: bool = True,
) -> SimulationResult:
    """``on_frame``, if given, is called with each map frame as it's produced
    (e.g. to remap/quantize/persist it immediately). ``keep_frames=False``
    skips accumulating them in the returned ``SimulationResult.map_frames``
    list — needed for a many-day run, where keeping every frame in memory
    (each a full ny*nx float64 array) would use tens of GB; a short run can
    leave both at their defaults and use the returned list as before.
    """
    spinup_hours = cfg.forcing.spinup_hours if spinup_hours is None else spinup_hours
    forecast_hours = cfg.forcing.forecast_hours if forecast_hours is None else forecast_hours
    station_output_minutes = cfg.forcing.output_interval_minutes if station_output_minutes is None else station_output_minutes

    spinup_start = run_start_utc - timedelta(hours=spinup_hours)
    total_hours = spinup_hours + forecast_hours
    boundary = build_boundary_forcing(cfg.forcing, spinup_start, total_hours)

    tide_cfg = TideConfig(
        dx_m=grid.metadata["resolution_m"],
        latitude_deg=cfg.physics.latitude_deg,
        hmin_m=cfg.physics.hmin_m,
        drag_cd=cfg.physics.drag_cd,
        viscosity_m2s=cfg.physics.viscosity_m2s,
        cfl=cfg.physics.cfl,
        use_coriolis=cfg.physics.use_coriolis,
        use_advection=cfg.physics.use_advection,
        use_numba=cfg.physics.use_numba,
        use_gpu=cfg.physics.use_gpu,
    )
    model = BarotropicTideModel(
        grid.depth_m, None, None, tide_cfg,
        open_u_face=grid.open_u_face, open_v_face=grid.open_v_face,
    )

    # Cold-start shock mitigation: starting the whole bay at eta=0 and then
    # immediately imposing the full-amplitude boundary tide excites a large,
    # slowly-damped basin transient/seiche that a realistic spin-up window
    # cannot fully shed. Initialize eta to the boundary's starting level and
    # ramp the forcing perturbation in smoothly over the first few hours
    # instead of stepping straight to full amplitude.
    eta0 = boundary.eta_at(0.0)
    model.eta[model.wet] = eta0
    ramp_seconds = min(3.0 * 3600.0, 0.3 * spinup_hours * 3600.0)

    station_cells: dict[str, tuple[int, int]] = {}
    for station in stations:
        rc = _station_rowcol(grid, station)
        if rc is not None:
            station_cells[station.id] = rc

    total_s = total_hours * 3600.0
    station_dt_s = station_output_minutes * 60.0
    map_dt_s = map_frame_minutes * 60.0
    next_station_sample = 0.0
    next_map_sample = spinup_hours * 3600.0  # only keep frames for the forecast window

    station_records: dict[str, list[dict]] = {sid: [] for sid in station_cells}
    map_frames: list[MapFrame] = []

    wall_start = time.monotonic()
    next_progress_at = wall_start + progress_every_s if progress_every_s else None

    while model.time_s < total_s:
        eta_bc_true = boundary.eta_at(model.time_s)
        ramp = min(1.0, model.time_s / ramp_seconds) if ramp_seconds > 0 else 1.0
        eta_bc = eta0 + ramp * (eta_bc_true - eta0)
        model.step(eta_bc)

        if model.time_s >= next_station_sample:
            u, v, speed = model.centered_velocity()
            t = pd.Timestamp(spinup_start) + timedelta(seconds=model.time_s)
            for sid, (r, c) in station_cells.items():
                station_records[sid].append(
                    {
                        "time_utc": t,
                        "eta_m": float(model.eta[r, c]),
                        "u_mps": float(u[r, c]) if np.isfinite(u[r, c]) else 0.0,
                        "v_mps": float(v[r, c]) if np.isfinite(v[r, c]) else 0.0,
                        "speed_mps": float(speed[r, c]) if np.isfinite(speed[r, c]) else 0.0,
                    }
                )
            next_station_sample += station_dt_s

        if model.time_s >= next_map_sample and model.time_s <= total_s:
            u, v, speed = model.centered_velocity()
            t = pd.Timestamp(spinup_start) + timedelta(seconds=model.time_s)
            frame = MapFrame(time_utc=t, eta=model.eta_numpy(), u=u.copy(), v=v.copy(), speed=speed.copy())
            if on_frame is not None:
                on_frame(frame)
            if keep_frames:
                map_frames.append(frame)
            next_map_sample += map_dt_s

        if next_progress_at is not None and time.monotonic() >= next_progress_at:
            phase = "spin-up" if model.time_s < spinup_hours * 3600.0 else "forecast"
            frac = model.time_s / total_s
            wall_elapsed = time.monotonic() - wall_start
            eta_remaining_s = wall_elapsed / frac - wall_elapsed if frac > 0 else float("nan")
            print(
                f"  [{phase}] {frac * 100:.1f}% "
                f"({model.time_s / 3600.0:.1f}h / {total_s / 3600.0:.1f}h sim) - "
                f"{wall_elapsed / 60.0:.1f} min elapsed, ~{eta_remaining_s / 60.0:.1f} min remaining",
                flush=True,
            )
            next_progress_at = time.monotonic() + progress_every_s

    station_series = {}
    for sid, records in station_records.items():
        df = pd.DataFrame.from_records(records).set_index("time_utc")
        df["direction_deg_true"] = (np.degrees(np.arctan2(df["u_mps"], df["v_mps"])) + 360.0) % 360.0
        station_series[sid] = df

    return SimulationResult(
        run_start_utc=run_start_utc,
        spinup_hours=spinup_hours,
        forecast_hours=forecast_hours,
        station_series=station_series,
        map_frames=map_frames,
        grid=grid,
        boundary_forcing=boundary,
    )

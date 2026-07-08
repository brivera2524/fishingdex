"""Build the open-boundary tidal forcing series from NOAA water levels."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from app.sdbay.config import ForcingConfig
from app.sdbay.noaa_client import DEFAULT_CACHE_ROOT, fetch_water_level


@dataclass
class BoundaryForcing:
    seconds_since_start: np.ndarray
    eta_m: np.ndarray
    run_start_utc: datetime
    station: str
    product: str
    raw: pd.DataFrame

    def eta_at(self, model_time_s: float) -> float:
        return float(np.interp(model_time_s, self.seconds_since_start, self.eta_m))


def build_boundary_forcing(
    cfg: ForcingConfig,
    run_start_utc: datetime,
    total_hours: float,
    end_pad_hours: float = 1.0,
    cache_root: Path = DEFAULT_CACHE_ROOT,
) -> BoundaryForcing:
    """Fetch NOAA water level covering [run_start_utc, run_start_utc + total_hours].

    Uses the ``predictions`` product by default: a smooth, tidal-only signal
    that is appropriate for a barotropic open-boundary condition (real
    observations would inject non-tidal meteorological noise directly at the
    boundary, which this model has no physics to represent).
    """
    begin = run_start_utc
    end = run_start_utc + timedelta(hours=total_hours + end_pad_hours)
    df = fetch_water_level(cfg.boundary_station, begin, end, product=cfg.boundary_product, cache_root=cache_root)
    seconds = (df.index - pd.Timestamp(run_start_utc)).total_seconds().to_numpy()
    # Both the DEM (bed elevation) and this NOAA product are referenced to
    # MLLW, so eta=0 already means "at MLLW" in both; no extra datum offset
    # is invented here.
    eta = df["water_level_m"].to_numpy()
    return BoundaryForcing(
        seconds_since_start=seconds,
        eta_m=eta,
        run_start_utc=run_start_utc,
        station=cfg.boundary_station,
        product=cfg.boundary_product,
        raw=df,
    )

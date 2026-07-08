"""Model configuration: grid resolution, physics parameters, run settings.

Loaded from ``configs/model.yaml``; every value here is overridable so
friction, viscosity, minimum depth, resolution, and boundary settings can be
adjusted for calibration without touching code.
"""
from __future__ import annotations

from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any

import yaml


@dataclass
class PhysicsConfig:
    drag_cd: float = 0.0025
    viscosity_m2s: float = 0.0
    hmin_m: float = 0.5
    cfl: float = 0.45
    use_coriolis: bool = True
    use_advection: bool = True  # nonlinear u.grad(u) momentum advection (upwind)
    latitude_deg: float = 32.7
    use_numba: bool = True  # fused JIT inner loop; ~8x faster. Set false to force pure NumPy.
    use_gpu: bool = False  # run the vectorized step on a CUDA GPU via CuPy; overrides use_numba


@dataclass
class GridConfig:
    resolution_m: float = 40.0
    grid_dir: str = "data/derived/grid_40m"
    source_nc: str = "data/raw/noaa_bathymetry/san_diego_bay_P020_2017.nc"
    min_valid_fraction: float = 0.5


@dataclass
class ForcingConfig:
    boundary_station: str = "9410170"  # Broadway Pier; nearest official NOAA water-level gauge
    boundary_product: str = "predictions"  # tidal-only, avoids injecting non-tidal noise at boundary
    validation_station: str = "9410170"
    spinup_hours: float = 30.0
    forecast_hours: float = 48.0
    output_interval_minutes: int = 6


@dataclass
class ValidationConfig:
    current_stations: list[str] = field(default_factory=lambda: ["PCT0031", "PCT0061"])
    water_level_station: str = "9410170"
    calibrated_amplitude_error_max_m: float = 0.15
    calibrated_timing_error_max_min: float = 45.0
    calibrated_speed_error_max_mps: float = 0.25


@dataclass
class ModelConfig:
    physics: PhysicsConfig = field(default_factory=PhysicsConfig)
    grid: GridConfig = field(default_factory=GridConfig)
    forcing: ForcingConfig = field(default_factory=ForcingConfig)
    validation: ValidationConfig = field(default_factory=ValidationConfig)
    timezone: str = "America/Los_Angeles"


def _build(cls, data: dict[str, Any]):
    kwargs = {}
    for f in fields(cls):
        if f.name in data:
            kwargs[f.name] = data[f.name]
    return cls(**kwargs)


def load_config(path: str | Path) -> ModelConfig:
    path = Path(path)
    raw = yaml.safe_load(path.read_text()) if path.exists() else {}
    raw = raw or {}
    return ModelConfig(
        physics=_build(PhysicsConfig, raw.get("physics", {})),
        grid=_build(GridConfig, raw.get("grid", {})),
        forcing=_build(ForcingConfig, raw.get("forcing", {})),
        validation=_build(ValidationConfig, raw.get("validation", {})),
        timezone=raw.get("timezone", "America/Los_Angeles"),
    )

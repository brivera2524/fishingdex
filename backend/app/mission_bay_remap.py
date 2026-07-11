"""Shared lon/lat regridding + compact storage helpers for the Mission Bay
current simulation. Mirrors app/sdbay_remap.py (San Diego Bay) exactly,
just with Mission Bay's own output grid bounds -- see that module's own
docstring for why this remap step exists at all.

Not imported by app/ocean_sim_mission_bay.py at request time (the served
header comes from bank_meta.json, baked in at bank-generation time) --
this module exists for regenerating the bank in the future, the same role
app/sdbay_remap.py plays for San Diego Bay.
"""

from __future__ import annotations

import numpy as np
from pyproj import Transformer

from app.sdbay.grid import GridData

# Mission Bay's own wet-cell extent is lon -117.270..-117.208, lat
# 32.735..32.811 (checked against the built grid); these bounds add a
# small margin beyond that, same spirit as San Diego Bay's own remap bounds.
OUT_LAT_MIN, OUT_LAT_MAX = 32.730, 32.815
OUT_LON_MIN, OUT_LON_MAX = -117.275, -117.205
OUT_NY, OUT_NX = 140, 115

VELOCITY_CLIP_MPS = 1.0
INT8_SCALE = 127.0 / VELOCITY_CLIP_MPS

_WGS84_TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:26911", always_xy=True)


def build_remap_indices(grid: GridData) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """For every cell of the output lon/lat grid, find the nearest cell of
    the solver's grid. Row 0 = north (matches leaflet-velocity's la1
    convention). Returns (row_idx, col_idx, valid) — `valid` is False for
    output cells that fall on land or outside the solver grid.
    """
    lats = np.linspace(OUT_LAT_MAX, OUT_LAT_MIN, OUT_NY)
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
    valid = in_bounds.reshape(OUT_NY, OUT_NX) & grid.wet_mask[row_c, col_c]

    return row_c, col_c, valid


def remap_frame(
    u: np.ndarray, v: np.ndarray, remap_indices: tuple[np.ndarray, np.ndarray, np.ndarray]
) -> tuple[np.ndarray, np.ndarray]:
    """Resample a solver-grid (u, v) pair onto the output grid. Invalid
    (land/out-of-bounds) output cells are NaN."""
    row_idx, col_idx, valid = remap_indices
    out_u = np.where(valid, u[row_idx, col_idx], np.nan)
    out_v = np.where(valid, v[row_idx, col_idx], np.nan)
    return out_u, out_v


def quantize(field: np.ndarray) -> np.ndarray:
    """NaN (land/no-data) -> -128 sentinel; otherwise clip to
    +-VELOCITY_CLIP_MPS and scale to int8."""
    out = np.full(field.shape, -128, dtype=np.int8)
    valid = np.isfinite(field)
    clipped = np.clip(field[valid], -VELOCITY_CLIP_MPS, VELOCITY_CLIP_MPS)
    out[valid] = np.round(clipped * INT8_SCALE).astype(np.int8)
    return out


def dequantize(field: np.ndarray) -> np.ndarray:
    out = field.astype(np.float32) / INT8_SCALE
    out[field == -128] = np.nan
    return out


def output_header() -> dict:
    """leaflet-velocity header fields shared by every served field."""
    return {
        "nx": OUT_NX,
        "ny": OUT_NY,
        "lo1": OUT_LON_MIN,
        "la1": OUT_LAT_MAX,
        "lo2": OUT_LON_MAX,
        "la2": OUT_LAT_MIN,
        "dx": (OUT_LON_MAX - OUT_LON_MIN) / (OUT_NX - 1),
        "dy": (OUT_LAT_MAX - OUT_LAT_MIN) / (OUT_NY - 1),
    }

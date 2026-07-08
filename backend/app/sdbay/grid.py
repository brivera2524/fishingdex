"""Runtime-only view of the San Diego Bay model grid.

This is a trimmed copy of the SD-current-sim project's ``sdbay.grid`` module,
keeping only what's needed to *load* an already-built grid (``load_grid`` /
``GridData``) and dropping the grid-*building* code path (``build_grid`` and
its helpers), which depends on rasterio/rioxarray/xarray/scipy — heavy,
GDAL-backed libraries only needed once, offline, to turn raw NOAA bathymetry
into the ``.npy`` files already checked into ``app/sim_data/grid_20m/``. The
backend only ever reads that pre-built grid.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass
class GridData:
    """Loaded model grid ready for the solver / diagnostics."""

    depth_m: np.ndarray
    wet_mask: np.ndarray
    land_mask: np.ndarray
    nodata_mask: np.ndarray
    open_u_face: np.ndarray
    open_v_face: np.ndarray
    metadata: dict

    @property
    def transform(self) -> tuple[float, float, float, float, float, float]:
        return tuple(self.metadata["transform"])

    def lonlat_to_rowcol(self, lon: float, lat: float) -> tuple[int, int]:
        from app.sdbay.stations import lonlat_to_model_xy

        x, y = lonlat_to_model_xy(lon, lat)
        a, b, c, d, e, f = self.transform
        col = int((x - c) / a)
        row = int((y - f) / e)
        return row, col

    def is_wet(self, row: int, col: int) -> bool:
        if not (0 <= row < self.wet_mask.shape[0] and 0 <= col < self.wet_mask.shape[1]):
            return False
        return bool(self.wet_mask[row, col])

    def nearest_wet_cell(self, row: int, col: int, max_radius_cells: int = 5) -> tuple[int, int] | None:
        """Snap a station's nominal grid cell to the nearest wet cell.

        NOAA station coordinates sometimes fall on a cell the DEM marks
        nodata or land at this grid's resolution (e.g. directly under a
        pier structure). This searches an expanding square neighborhood and
        returns the closest wet cell by Euclidean distance, or None if
        nothing wet is within ``max_radius_cells``.
        """
        if self.is_wet(row, col):
            return row, col
        ny, nx = self.wet_mask.shape
        best: tuple[int, int] | None = None
        best_dist2 = None
        for radius in range(1, max_radius_cells + 1):
            r0, r1 = max(row - radius, 0), min(row + radius, ny - 1)
            c0, c1 = max(col - radius, 0), min(col + radius, nx - 1)
            for r in range(r0, r1 + 1):
                for c in range(c0, c1 + 1):
                    if not self.wet_mask[r, c]:
                        continue
                    d2 = (r - row) ** 2 + (c - col) ** 2
                    if best_dist2 is None or d2 < best_dist2:
                        best_dist2 = d2
                        best = (r, c)
            if best is not None:
                return best
        return None


def load_grid(grid_dir: Path) -> GridData:
    grid_dir = Path(grid_dir)
    metadata = json.loads((grid_dir / "grid_metadata.json").read_text())
    return GridData(
        depth_m=np.load(grid_dir / "depth_m.npy"),
        wet_mask=np.load(grid_dir / "wet_mask.npy"),
        land_mask=np.load(grid_dir / "land_mask.npy"),
        nodata_mask=np.load(grid_dir / "nodata_mask.npy"),
        open_u_face=np.load(grid_dir / "open_u_face.npy"),
        open_v_face=np.load(grid_dir / "open_v_face.npy"),
        metadata=metadata,
    )

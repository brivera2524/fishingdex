"""Reference station registry: NOAA CO-OPS water-level and current stations.

Coordinates are the public NOAA station coordinates for each station page.
Everything downstream (grid indices, validation) must derive from this single
source rather than re-typing coordinates in multiple scripts.
"""
from __future__ import annotations

from dataclasses import dataclass

from pyproj import Transformer

MODEL_CRS = "EPSG:26911"  # UTM Zone 11N, used for the model grid
_WGS84_TO_MODEL = Transformer.from_crs("EPSG:4326", MODEL_CRS, always_xy=True)


@dataclass(frozen=True)
class Station:
    id: str
    name: str
    lon: float
    lat: float
    kind: str  # "water_level" | "current"
    nominal_depth_m: float | None = None

    @property
    def utm(self) -> tuple[float, float]:
        return _WGS84_TO_MODEL.transform(self.lon, self.lat)


BROADWAY_PIER = Station(
    id="9410170",
    name="Broadway Pier, San Diego Bay",
    lon=-117.17358,
    lat=32.71419,
    kind="water_level",
)

PCT0031_BAY_ENTRANCE = Station(
    id="PCT0031",
    name="San Diego Bay Entrance",
    lon=-117.2300,
    lat=32.6817,
    kind="current",
)

PCT0061_HARBOR_ISLAND = Station(
    id="PCT0061",
    name="Harbor Island (east end)",
    lon=-117.1917,
    lat=32.7192,
    kind="current",
    nominal_depth_m=15.0 * 0.3048,
)

ALL_STATIONS = [BROADWAY_PIER, PCT0031_BAY_ENTRANCE, PCT0061_HARBOR_ISLAND]


def lonlat_to_model_xy(lon: float, lat: float) -> tuple[float, float]:
    return _WGS84_TO_MODEL.transform(lon, lat)

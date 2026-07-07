"""Gridded ocean current data for the Map page's current overlay.

Open-Meteo's Marine API (tried first) turned out to be a coarse regional
ocean model with no land mask — it returns a plausible-looking reading for
a point in downtown San Diego, and direction barely varies across the whole
county because it's really just reporting the broad California Current, not
bay-scale circulation. NOAA/Scripps's HFRadar US West Coast "totals" product
is the real thing: actual observed surface currents from the SCCOOS/CORDC
HF radar network, at 2km resolution, with genuine land masking.

That data lives on a NOAA ERDDAP server with no CORS headers, so it can't
be fetched directly from the browser — this module fetches and reshapes it
server-side, and the router below exposes it to the frontend from our own
already-CORS-enabled API instead.
"""

import time

import httpx

ERDDAP_URL = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/ucsdHfrW2.json"

# San Diego's coastal + bay waters — the same practical area the rest of the
# app treats as "San Diego," narrowed to where current data actually means
# something (open water), not the full inland tile-prefetch bounding box.
LAT_MIN, LAT_MAX = 32.5, 33.0
LON_MIN, LON_MAX = -117.35, -117.05

CACHE_TTL_SECONDS = 20 * 60
_cache: list[dict] | None = None
_cache_expires_at = 0.0


class CurrentFieldUnavailable(Exception):
    """NOAA's ERDDAP server couldn't be reached or returned unusable data."""


def _fetch_rows() -> list[list]:
    query = (
        f"water_u[(last)][({LAT_MIN}):({LAT_MAX})][({LON_MIN}):({LON_MAX})],"
        f"water_v[(last)][({LAT_MIN}):({LAT_MAX})][({LON_MIN}):({LON_MAX})]"
    )
    try:
        resp = httpx.get(f"{ERDDAP_URL}?{query}", timeout=20)
        resp.raise_for_status()
        return resp.json()["table"]["rows"]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise CurrentFieldUnavailable(str(exc)) from exc


def _build_velocity_records(rows: list[list]) -> list[dict]:
    """Reshapes ERDDAP's flat (time, lat, lon, u, v) table into the
    header+data grid format leaflet-velocity expects on the frontend.

    ERDDAP returns rows ordered by ascending latitude (south to north) then
    ascending longitude — leaflet-velocity wants row 0 to be la1, the
    NORTHERNMOST latitude, with rows proceeding south, so the row order gets
    reversed when flattening.
    """
    if not rows:
        raise CurrentFieldUnavailable("ERDDAP returned no grid points for this bounding box")

    lats = sorted({r[1] for r in rows})
    lons = sorted({r[2] for r in rows})
    ny, nx = len(lats), len(lons)
    lat_index = {lat: i for i, lat in enumerate(lats)}
    lon_index = {lon: i for i, lon in enumerate(lons)}

    # None (-> JSON null -> frontend NaN) marks land/no-observation cells —
    # every cell starts here and only gets overwritten by an actual reading.
    u_grid: list[list[float | None]] = [[None] * nx for _ in range(ny)]
    v_grid: list[list[float | None]] = [[None] * nx for _ in range(ny)]
    for _time, lat, lon, u, v in rows:
        if u is None or v is None:
            continue
        u_grid[lat_index[lat]][lon_index[lon]] = u
        v_grid[lat_index[lat]][lon_index[lon]] = v

    u_flat = [value for row in reversed(u_grid) for value in row]
    v_flat = [value for row in reversed(v_grid) for value in row]

    header_common = {
        "nx": nx,
        "ny": ny,
        "lo1": lons[0],
        "la1": lats[-1],
        "lo2": lons[-1],
        "la2": lats[0],
        "dx": (lons[-1] - lons[0]) / (nx - 1) if nx > 1 else 0,
        "dy": (lats[-1] - lats[0]) / (ny - 1) if ny > 1 else 0,
        "refTime": rows[0][0],
        "forecastTime": 0,
    }
    return [
        {"header": {**header_common, "parameterCategory": 2, "parameterNumber": 2}, "data": u_flat},
        {"header": {**header_common, "parameterCategory": 2, "parameterNumber": 3}, "data": v_flat},
    ]


def get_current_field() -> list[dict]:
    """Returns the cached (or freshly fetched) velocity grid.

    A single process-wide cache is plenty here — there's one fixed bounding
    box, a small friend-group's worth of traffic, and the underlying HFRadar
    product itself only updates hourly.
    """
    global _cache, _cache_expires_at
    now = time.monotonic()
    if _cache is not None and now < _cache_expires_at:
        return _cache

    rows = _fetch_rows()
    records = _build_velocity_records(rows)
    _cache = records
    _cache_expires_at = now + CACHE_TTL_SECONDS
    return records

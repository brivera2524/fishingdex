"""Simulated San Diego Bay current field for the Map page's current overlay.

app/ocean_current.py serves real observed HFRadar data, but that product has
no usable resolution *inside* San Diego Bay (see its docstring) — it only
covers open coastal water. This module fills that gap with a physics-based
estimate, but *not* by running the physics solver live: the solver
(vendored in app/sdbay/) is barotropic and tide-only (no wind/wave/river
forcing), so the current field at any moment is well-approximated as a
function of just two numbers — the boundary tide's water level (eta) and
its rate of change (deta/dt, i.e. flood vs. ebb and how hard). Two different
real moments with similar (eta, deta/dt) look nearly the same regardless of
the calendar date.

So the expensive part (a multi-day GPU simulation spanning a full
spring-neap cycle) happens once, offline, on real hardware with a GPU
(scripts/generate_current_bank.py) — never on Railway's dyno, which has
none. That produces a compact "bank" of representative (eta, deta/dt) ->
current-field snapshots (app/sim_data/current_bank/). This module just:
fetches today's real NOAA tide prediction, computes real (eta, deta/dt) for
"now," and interpolates between the nearest bank entries — pure array math,
a few milliseconds, no solver.

This is a genuine simulation, not a measurement — see app/sdbay/'s
DISCLAIMER. It should be presented to users as an estimate ("modeled," not
"observed").

Confidence (see SD-current-sim's docs/LIMITATIONS.md for detail):
- Flood/ebb direction and bulk channel speed: well-validated against real
  NOAA current stations (correlation ~0.9+).
- Absolute peak speed at fast, narrow features: the model underestimates it
  somewhat. Treat modeled speed as relative/qualitative, not precise.
- No wind, swell, or wake — tide-only.
"""

import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from app.sdbay.config import load_config
from app.sdbay.forcing import build_boundary_forcing

SIM_DATA_DIR = Path(__file__).resolve().parent / "sim_data"
CONFIG_PATH = SIM_DATA_DIR / "model.yaml"
BANK_DIR = SIM_DATA_DIR / "current_bank"

DETA_DT_WINDOW_S = 300.0  # matches the generation script's own tagging window
K_NEAREST = 3
CACHE_TTL_SECONDS = 15 * 60  # real tide moves slowly; matches ocean_current.py's cache pattern


class BayCurrentUnavailable(Exception):
    """The current NOAA tide prediction couldn't be fetched, or no bank exists."""


_bank = None  # lazily loaded: (points_normalized, scale, eta, deta_dt, u, v, header, int8_scale)
_cache: dict | None = None
_cache_expires_at = 0.0


def _load_bank():
    global _bank
    if _bank is not None:
        return _bank

    import json

    if not (BANK_DIR / "bank.npz").exists():
        raise BayCurrentUnavailable(
            f"No current bank at {BANK_DIR} — run scripts/generate_current_bank.py on a GPU machine first."
        )
    data = np.load(BANK_DIR / "bank.npz")
    meta = json.loads((BANK_DIR / "bank_meta.json").read_text())

    eta, deta_dt = data["eta"], data["deta_dt"]
    points = np.stack([eta, deta_dt], axis=1)
    scale = points.std(axis=0)
    tree = cKDTree(points / scale)

    _bank = {
        "tree": tree,
        "scale": scale,
        "u": data["u"],
        "v": data["v"],
        "header": meta["header"],
        "int8_scale": meta["int8_scale"],
    }
    return _bank


def _current_eta_state(cfg) -> tuple[float, float]:
    """Real (eta, deta/dt) right now, from NOAA's tide prediction — the same
    two numbers the bank is indexed by."""
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=1)
    boundary = build_boundary_forcing(cfg.forcing, window_start, total_hours=2.0)
    now_s = (now - window_start).total_seconds()
    eta = boundary.eta_at(now_s)
    deta_dt = (boundary.eta_at(now_s + DETA_DT_WINDOW_S) - boundary.eta_at(now_s - DETA_DT_WINDOW_S)) / (
        2 * DETA_DT_WINDOW_S
    )
    return eta, deta_dt


def _dequantize(field: np.ndarray, int8_scale: float) -> np.ndarray:
    out = field.astype(np.float32) / int8_scale
    out[field == -128] = np.nan
    return out


def _interpolate_field(bank: dict, eta: float, deta_dt: float) -> tuple[np.ndarray, np.ndarray]:
    query = np.array([eta, deta_dt]) / bank["scale"]
    k = min(K_NEAREST, bank["u"].shape[0])
    dists, idx = bank["tree"].query(query, k=k)
    dists, idx = np.atleast_1d(dists), np.atleast_1d(idx)
    weights = 1.0 / np.maximum(dists, 1e-6)
    weights /= weights.sum()

    u = sum(w * bank["u"][i].astype(np.float32) for w, i in zip(weights, idx))
    v = sum(w * bank["v"][i].astype(np.float32) for w, i in zip(weights, idx))
    return _dequantize(u, bank["int8_scale"]), _dequantize(v, bank["int8_scale"])


def _build_records(bank: dict, u: np.ndarray, v: np.ndarray, eta: float, deta_dt: float) -> list[dict]:
    u_flat = [None if not np.isfinite(val) else float(val) for val in u.ravel()]
    v_flat = [None if not np.isfinite(val) else float(val) for val in v.ravel()]

    header_common = {
        **bank["header"],
        "refTime": datetime.now(timezone.utc).isoformat(),
        "forecastTime": 0,
    }
    return [
        {"header": {**header_common, "parameterCategory": 2, "parameterNumber": 2}, "data": u_flat},
        {"header": {**header_common, "parameterCategory": 2, "parameterNumber": 3}, "data": v_flat},
    ]


def get_bay_current_field() -> dict:
    """Returns the cached (or freshly interpolated) bay current field.

    Cheap enough to run per-request (a small NOAA API call + a few
    milliseconds of array math), but cached briefly anyway since real tide
    state barely changes minute to minute and this matches the existing
    HFRadar endpoint's caching pattern.
    """
    global _cache, _cache_expires_at
    now = time.monotonic()
    if _cache is not None and now < _cache_expires_at:
        return _cache

    bank = _load_bank()
    cfg = load_config(CONFIG_PATH)
    eta, deta_dt = _current_eta_state(cfg)
    u, v = _interpolate_field(bank, eta, deta_dt)
    records = _build_records(bank, u, v, eta, deta_dt)

    result = {"status": "ready", "records": records, "eta_m": eta, "deta_dt_mps": deta_dt}
    _cache = result
    _cache_expires_at = now + CACHE_TTL_SECONDS
    return result

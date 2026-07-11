"""Simulated Mission Bay current field for the Map page's current overlay.

Mirrors app/ocean_sim.py (San Diego Bay) exactly -- same bank-lookup
approach, same reasoning for why a precomputed bank beats a live solve.
See that module's own docstring for the full "why."

Two differences worth calling out for Mission Bay specifically:
- Its bathymetry comes from a different NOAA DEM (see
  app/sim_data/model_mission_bay.yaml for why San Diego Bay's own P020
  product doesn't have a Mission Bay equivalent), converted from NAVD88
  to MLLW via a fixed offset rather than a natively-MLLW source.
- There is no independent NOAA current data near Mission Bay to validate
  against (unlike San Diego Bay's PCT0031/PCT0061) -- this should be
  presented to users as experimental/uncalibrated, more so even than
  San Diego Bay's own "modeled, not observed" framing.
"""

import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from app.sdbay.config import load_config
from app.sdbay.forcing import build_boundary_forcing

SIM_DATA_DIR = Path(__file__).resolve().parent / "sim_data"
CONFIG_PATH = SIM_DATA_DIR / "model_mission_bay.yaml"
BANK_DIR = SIM_DATA_DIR / "current_bank_mission_bay"

DETA_DT_WINDOW_S = 300.0
K_NEAREST = 3
CACHE_TTL_SECONDS = 15 * 60


class MissionBayCurrentUnavailable(Exception):
    """The current NOAA tide prediction couldn't be fetched, or no bank exists."""


_bank = None
_cache: dict | None = None
_cache_expires_at = 0.0


def _load_bank():
    global _bank
    if _bank is not None:
        return _bank

    import json

    if not (BANK_DIR / "bank.npz").exists():
        raise MissionBayCurrentUnavailable(
            f"No current bank at {BANK_DIR} — generate one (see scripts/generate_current_bank.py "
            "for the San Diego Bay equivalent this was adapted from) first."
        )
    data = np.load(BANK_DIR / "bank.npz")
    meta = json.loads((BANK_DIR / "bank_meta.json").read_text())

    eta, deta_dt = data["eta"], data["deta_dt"]
    points = np.stack([eta, deta_dt], axis=1)
    scale = points.std(axis=0)
    tree = cKDTree(points / scale)

    land_mask = data["u"][0] == -128

    _bank = {
        "tree": tree,
        "scale": scale,
        "u": data["u"],
        "v": data["v"],
        "land_mask": land_mask,
        "header": meta["header"],
        "int8_scale": meta["int8_scale"],
    }
    return _bank


def _current_eta_state(cfg) -> tuple[float, float]:
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=1)
    boundary = build_boundary_forcing(cfg.forcing, window_start, total_hours=2.0)
    now_s = (now - window_start).total_seconds()
    eta = boundary.eta_at(now_s)
    deta_dt = (boundary.eta_at(now_s + DETA_DT_WINDOW_S) - boundary.eta_at(now_s - DETA_DT_WINDOW_S)) / (
        2 * DETA_DT_WINDOW_S
    )
    return eta, deta_dt


def _dequantize(field: np.ndarray, int8_scale: float, land_mask: np.ndarray) -> np.ndarray:
    out = field.astype(np.float32) / int8_scale
    out[land_mask] = np.nan
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
    return (
        _dequantize(u, bank["int8_scale"], bank["land_mask"]),
        _dequantize(v, bank["int8_scale"], bank["land_mask"]),
    )


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


def get_mission_bay_current_field() -> dict:
    """Returns the cached (or freshly interpolated) Mission Bay current field."""
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

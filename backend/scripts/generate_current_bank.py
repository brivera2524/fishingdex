"""Generate the San Diego Bay current "scenario bank" served in production.

Why this exists: the solver is barotropic and tide-only (no wind/wave/river
forcing — see app/sdbay's docs echoed in app/ocean_sim.py), so the current
field at any moment is well-approximated as a function of just two numbers:
the boundary tide's water level (eta) and its rate of change (deta/dt —
flood vs. ebb, and how hard). Two different real moments with similar
(eta, deta/dt) should look nearly the same, regardless of the calendar date.

So instead of running the expensive physics solve live in production (which
needs a real GPU to be fast, and Railway's dyno has none), this script runs
ONE long simulation once, here, on a real GPU — spanning slightly more than
a full spring-neap cycle (~16 days) so it sees the full range of tide
strengths — samples it every 15 minutes, tags each sample with its own
(eta, deta/dt), and reduces that to a compact "bank" of representative
snapshots. Production then just looks up the nearest bank entries for
today's real (eta, deta/dt) and interpolates — pure array math, no solver.

Run this on a machine with a CUDA GPU (`pip install cupy-cuda12x` first).
Takes on the order of an hour. Output: app/sim_data/current_bank/bank.npz
+ bank_meta.json.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.sdbay.config import load_config  # noqa: E402
from app.sdbay.forcing import build_boundary_forcing  # noqa: E402
from app.sdbay.grid import load_grid  # noqa: E402
from app.sdbay.simulate import MapFrame, run_simulation  # noqa: E402
from app.sdbay_remap import build_remap_indices, quantize, remap_frame  # noqa: E402

SIM_DATA_DIR = BACKEND_ROOT / "app" / "sim_data"
GRID_DIR = SIM_DATA_DIR / "grid_20m"
CONFIG_PATH = SIM_DATA_DIR / "model.yaml"
OUT_DIR = SIM_DATA_DIR / "current_bank"

SPINUP_HOURS = 30.0
FORECAST_HOURS = 16 * 24.0  # slightly more than one full spring-neap cycle (~14.77 days)
MAP_FRAME_MINUTES = 15.0
DETA_DT_WINDOW_S = 300.0  # central-difference window for the rate-of-change tag

# Reduction: bin raw samples into a 2D (eta, deta/dt) grid and keep one
# representative (bin-average) entry per occupied bin. Density chosen to
# comfortably cover the observed range without an excessive final bank —
# tuned empirically below by checking the printed bank size + validation RMSE.
ETA_BINS = 14
RATE_BINS = 14

HOLDOUT_FRACTION = 0.15  # fraction of raw samples reserved for validation, not binned into the bank
RNG_SEED = 0


def main() -> None:
    cfg = load_config(CONFIG_PATH)
    cfg.physics.use_gpu = True
    grid = load_grid(GRID_DIR)
    remap_indices = build_remap_indices(grid)

    run_start_utc = datetime.now(timezone.utc)
    spinup_start = run_start_utc - timedelta(hours=SPINUP_HOURS)
    total_hours = SPINUP_HOURS + FORECAST_HOURS
    # Mirrors what run_simulation builds internally — built again here (same
    # params, so it hits noaa_client's on-disk cache) so on_frame can tag
    # each streamed frame with its boundary eta/deta_dt without needing
    # run_simulation to return that object mid-run.
    boundary = build_boundary_forcing(cfg.forcing, spinup_start, total_hours)

    raw_samples: list[dict] = []
    t0 = time.monotonic()
    frame_count = 0

    def on_frame(frame: MapFrame) -> None:
        nonlocal frame_count
        frame_count += 1
        elapsed_s = (frame.time_utc.to_pydatetime() - spinup_start).total_seconds()
        eta = boundary.eta_at(elapsed_s)
        deta_dt = (
            boundary.eta_at(elapsed_s + DETA_DT_WINDOW_S) - boundary.eta_at(elapsed_s - DETA_DT_WINDOW_S)
        ) / (2 * DETA_DT_WINDOW_S)
        out_u, out_v = remap_frame(frame.u, frame.v, remap_indices)
        raw_samples.append(
            {
                "time_utc": frame.time_utc,
                "eta": eta,
                "deta_dt": deta_dt,
                "u": quantize(out_u),
                "v": quantize(out_v),
            }
        )
    print(f"Running {total_hours:.0f}h simulation ({SPINUP_HOURS:.0f}h spin-up + {FORECAST_HOURS:.0f}h) on GPU...")
    run_simulation(
        cfg,
        grid,
        run_start_utc=run_start_utc,
        spinup_hours=SPINUP_HOURS,
        forecast_hours=FORECAST_HOURS,
        map_frame_minutes=MAP_FRAME_MINUTES,
        on_frame=on_frame,
        keep_frames=False,
        progress_every_s=45.0,
    )
    elapsed_min = (time.monotonic() - t0) / 60.0
    print(f"Simulation complete: {frame_count} frames in {elapsed_min:.1f} min")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    _save_raw_samples(raw_samples)
    build_bank(raw_samples)


def _save_raw_samples(raw_samples: list[dict]) -> None:
    """Checkpoint the expensive GPU run's output so the binning/validation
    step below can be re-tuned without re-running the simulation."""
    np.savez_compressed(
        OUT_DIR / "raw_samples.npz",
        eta=np.array([s["eta"] for s in raw_samples]),
        deta_dt=np.array([s["deta_dt"] for s in raw_samples]),
        u=np.stack([s["u"] for s in raw_samples]),
        v=np.stack([s["v"] for s in raw_samples]),
        time_utc=np.array([s["time_utc"].isoformat() for s in raw_samples]),
    )
    print(f"Saved {len(raw_samples)} raw samples to {OUT_DIR / 'raw_samples.npz'}")


def build_bank(raw_samples: list[dict] | None = None) -> None:
    """Bin the raw samples into a compact bank and validate it against a
    held-out subset. Can be called standalone (reloading raw_samples.npz)
    to re-tune ETA_BINS/RATE_BINS without re-running the GPU simulation."""
    if raw_samples is None:
        raw_samples = _load_raw_samples()

    rng = np.random.default_rng(RNG_SEED)
    n = len(raw_samples)
    idx = rng.permutation(n)
    n_holdout = int(n * HOLDOUT_FRACTION)
    holdout_idx, train_idx = idx[:n_holdout], idx[n_holdout:]

    etas = np.array([s["eta"] for s in raw_samples])
    deta_dts = np.array([s["deta_dt"] for s in raw_samples])

    eta_edges = np.linspace(etas[train_idx].min(), etas[train_idx].max(), ETA_BINS + 1)
    rate_edges = np.linspace(deta_dts[train_idx].min(), deta_dts[train_idx].max(), RATE_BINS + 1)

    bank_entries: list[dict] = []
    for i in range(ETA_BINS):
        for j in range(RATE_BINS):
            in_bin = train_idx[
                (etas[train_idx] >= eta_edges[i])
                & (etas[train_idx] < eta_edges[i + 1] + (1e-9 if i == ETA_BINS - 1 else 0))
                & (deta_dts[train_idx] >= rate_edges[j])
                & (deta_dts[train_idx] < rate_edges[j + 1] + (1e-9 if j == RATE_BINS - 1 else 0))
            ]
            if len(in_bin) == 0:
                continue
            u_stack = np.stack([raw_samples[k]["u"].astype(np.float32) for k in in_bin])
            v_stack = np.stack([raw_samples[k]["v"].astype(np.float32) for k in in_bin])
            # Land cells are the sentinel -128 in every sample in a bin (the
            # wet/land mask never changes between samples), so averaging
            # never mixes a real value with the sentinel.
            bank_entries.append(
                {
                    "eta": float(etas[in_bin].mean()),
                    "deta_dt": float(deta_dts[in_bin].mean()),
                    "u": np.round(u_stack.mean(axis=0)).astype(np.int8),
                    "v": np.round(v_stack.mean(axis=0)).astype(np.int8),
                    "n_samples": len(in_bin),
                }
            )

    print(f"Bank: {len(bank_entries)} entries from {len(train_idx)} training samples "
          f"({ETA_BINS}x{RATE_BINS} bins, {len(bank_entries)}/{ETA_BINS * RATE_BINS} occupied)")

    rmse = _validate(bank_entries, raw_samples, holdout_idx)
    print(f"Hold-out validation RMSE: {rmse:.4f} m/s (n={len(holdout_idx)})")

    _save_bank(bank_entries)


def _load_raw_samples() -> list[dict]:
    data = np.load(OUT_DIR / "raw_samples.npz", allow_pickle=False)
    n = len(data["eta"])
    return [
        {"eta": float(data["eta"][i]), "deta_dt": float(data["deta_dt"][i]), "u": data["u"][i], "v": data["v"][i]}
        for i in range(n)
    ]


def _validate(bank_entries: list[dict], raw_samples: list[dict], holdout_idx: np.ndarray, k: int = 3) -> float:
    from scipy.spatial import cKDTree

    points = np.array([[e["eta"], e["deta_dt"]] for e in bank_entries])
    # Normalize both axes to comparable scale before nearest-neighbor search
    # (eta is O(1) m, deta_dt is O(1e-4) m/s — without this, distance is
    # almost entirely determined by eta and ignores tide direction/rate).
    scale = points.std(axis=0)
    tree = cKDTree(points / scale)

    sq_errors = []
    for idx in holdout_idx:
        sample = raw_samples[idx]
        query = np.array([sample["eta"], sample["deta_dt"]]) / scale
        dists, neighbor_idx = tree.query(query, k=min(k, len(bank_entries)))
        dists = np.atleast_1d(dists)
        neighbor_idx = np.atleast_1d(neighbor_idx)
        weights = 1.0 / np.maximum(dists, 1e-6)
        weights /= weights.sum()

        pred_u = sum(w * bank_entries[i]["u"].astype(np.float32) for w, i in zip(weights, neighbor_idx))
        pred_v = sum(w * bank_entries[i]["v"].astype(np.float32) for w, i in zip(weights, neighbor_idx))
        true_u = sample["u"].astype(np.float32)
        true_v = sample["v"].astype(np.float32)

        wet = (true_u != -128) & (pred_u != -128)
        if not wet.any():
            continue
        from app.sdbay_remap import INT8_SCALE

        du = (pred_u[wet] - true_u[wet]) / INT8_SCALE
        dv = (pred_v[wet] - true_v[wet]) / INT8_SCALE
        sq_errors.append(np.mean(du**2 + dv**2))

    return float(np.sqrt(np.mean(sq_errors)))


def _save_bank(bank_entries: list[dict]) -> None:
    from app.sdbay_remap import INT8_SCALE, VELOCITY_CLIP_MPS, output_header

    np.savez_compressed(
        OUT_DIR / "bank.npz",
        eta=np.array([e["eta"] for e in bank_entries], dtype=np.float32),
        deta_dt=np.array([e["deta_dt"] for e in bank_entries], dtype=np.float32),
        u=np.stack([e["u"] for e in bank_entries]),
        v=np.stack([e["v"] for e in bank_entries]),
    )
    meta = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "n_entries": len(bank_entries),
        "int8_scale": INT8_SCALE,
        "velocity_clip_mps": VELOCITY_CLIP_MPS,
        "header": output_header(),
        "spinup_hours": SPINUP_HOURS,
        "forecast_hours": FORECAST_HOURS,
        "map_frame_minutes": MAP_FRAME_MINUTES,
    }
    (OUT_DIR / "bank_meta.json").write_text(json.dumps(meta, indent=2))

    size_mb = (OUT_DIR / "bank.npz").stat().st_size / 1e6
    print(f"Saved bank.npz ({size_mb:.2f} MB) + bank_meta.json to {OUT_DIR}")


if __name__ == "__main__":
    main()

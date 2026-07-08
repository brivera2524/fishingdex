"""2-D depth-averaged (barotropic) shallow-water solver on an Arakawa C grid.

Design constraints carried over from the workbench prototype
(``sd_bay_workbench/barotropic_open_boundary.py``), generalized to support an
open boundary on any single outer edge of the grid (San Diego Bay's entrance
sits on the west edge of the NOAA P020 domain, not the south edge the
prototype assumed):

- No tidal elevation is ever imposed on an interior wet cell. The only
  forcing is a prescribed exterior sea level applied through a Flather
  radiation condition at a deliberately chosen open-ocean boundary face.
- Solid walls are exactly the land/nodata mask; there is no "first wet
  pixel" special case.
- Transport uses face depths (h at the u/v face), not a cell-centre depth
  applied to two unrelated faces.
- Timestep is chosen from the CFL condition for the fastest gravity wave
  supported by the grid.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

G = 9.80665
OMEGA = 7.2921159e-5

Edge = Literal["north", "south", "east", "west"]


def coarsen_depth(depth_m: np.ndarray, factor: int, hmin_m: float = 0.5, min_wet_fraction: float = 0.20) -> np.ndarray:
    """Block-average depth. Never use stride sampling such as depth[::factor, ::factor]."""
    if factor < 1:
        raise ValueError("factor must be >= 1")
    a = np.asarray(depth_m, dtype=np.float64)
    ny = (a.shape[0] // factor) * factor
    nx = (a.shape[1] // factor) * factor
    a = a[:ny, :nx]
    blocks = a.reshape(ny // factor, factor, nx // factor, factor)
    wet = np.isfinite(blocks) & (blocks > hmin_m)
    fraction = wet.mean(axis=(1, 3))
    depth = np.divide(
        np.where(wet, blocks, 0.0).sum(axis=(1, 3)),
        np.maximum(wet.sum(axis=(1, 3), dtype=float), 1.0),
    )
    depth[fraction < min_wet_fraction] = 0.0
    return depth


@dataclass(frozen=True)
class TideConfig:
    dx_m: float
    dy_m: float | None = None
    latitude_deg: float = 32.7
    hmin_m: float = 0.5
    drag_cd: float = 0.0025
    viscosity_m2s: float = 0.0
    cfl: float = 0.45
    use_coriolis: bool = True
    use_advection: bool = True  # nonlinear u.grad(u) momentum advection (upwind)
    use_numba: bool = False  # fused JIT inner loop; ~15-40x faster for long runs
    use_gpu: bool = False  # run the vectorized step on a CUDA GPU via CuPy; mutually exclusive with use_numba


class BarotropicTideModel:
    """Linear depth-averaged shallow-water model on an Arakawa C grid.

    Grid orientation: x grows east with array column, y grows north with
    *decreasing* array row (row 0 is the northernmost row, matching a
    north-up raster). ``open_edge``/``open_mask`` designate a single outer
    edge of the domain as a real ocean boundary; every other exterior face
    is a solid, free-slip wall defined by the wet/dry mask.
    """

    def __init__(
        self,
        depth_m: np.ndarray,
        open_edge: Edge | None,
        open_mask: np.ndarray | None,
        config: TideConfig,
        open_u_face: np.ndarray | None = None,
        open_v_face: np.ndarray | None = None,
    ):
        """Open boundary can be specified two ways:

        - ``open_edge`` (a str like "west") + ``open_mask`` (1-D per-edge-cell
          bool): the whole named grid edge is the open boundary. Simple,
          backward-compatible, used by the synthetic tests.
        - ``open_u_face`` / ``open_v_face``: explicit boolean masks (shaped
          like ``u`` and ``v``) marking arbitrary open faces anywhere in the
          domain, not just a grid edge. Used for the real San Diego Bay grid,
          whose ocean boundary is an ocean-apron cross-section at the entrance
          throat, not a full grid edge.
        """
        self.cfg = config
        self.dx = config.dx_m
        self.dy = config.dy_m or config.dx_m
        self.H = np.asarray(depth_m, dtype=np.float64)
        if self.H.ndim != 2:
            raise ValueError("depth_m must be 2-D")
        self.wet = np.isfinite(self.H) & (self.H > config.hmin_m)
        if not np.any(self.wet):
            raise ValueError("depth_m has no wet cells above hmin_m")
        self.H = np.where(self.wet, self.H, 0.0)
        self.ny, self.nx = self.H.shape
        self.open_edge = open_edge

        self.eta = np.zeros_like(self.H)
        self.u = np.zeros((self.ny, self.nx + 1), dtype=np.float64)  # eastward faces
        self.v = np.zeros((self.ny + 1, self.nx), dtype=np.float64)  # northward faces (row 0 = north face)

        # Resolve the open boundary to explicit open-face masks.
        if open_u_face is not None or open_v_face is not None:
            self._general_open = True
            self.ou_face = np.zeros_like(self.u, dtype=bool) if open_u_face is None else np.asarray(open_u_face, dtype=bool)
            self.ov_face = np.zeros_like(self.v, dtype=bool) if open_v_face is None else np.asarray(open_v_face, dtype=bool)
        else:
            self._general_open = False
            if open_edge is None:
                raise ValueError("Provide either open_edge or open_u_face/open_v_face")
            open_mask = np.asarray(open_mask, dtype=bool)
            edge_len = self.nx if open_edge in ("north", "south") else self.ny
            if open_mask.shape != (edge_len,):
                raise ValueError(f"open_mask must have shape ({edge_len},) for edge {open_edge!r}")
            edge_wet = self.wet[0, :] if open_edge == "north" else \
                self.wet[-1, :] if open_edge == "south" else \
                self.wet[:, 0] if open_edge == "west" else self.wet[:, -1]
            self.open_mask = open_mask & edge_wet
            if not np.any(self.open_mask):
                raise ValueError(f"No wet {open_edge} boundary cells were selected as open ocean")
            self.ou_face = np.zeros_like(self.u, dtype=bool)
            self.ov_face = np.zeros_like(self.v, dtype=bool)
            if open_edge == "west":
                self.ou_face[:, 0] = self.open_mask
            elif open_edge == "east":
                self.ou_face[:, -1] = self.open_mask
            elif open_edge == "north":
                self.ov_face[0, :] = self.open_mask
            else:  # south
                self.ov_face[-1, :] = self.open_mask

        # Build flat open-face index arrays with interior cell + inward sign.
        self._build_open_face_index()
        if self.ou_idx.size == 0 and self.ov_idx.size == 0:
            raise ValueError("No valid open-boundary faces (each must border exactly one wet interior cell)")

        self.u_active = np.zeros_like(self.u, dtype=bool)
        self.v_active = np.zeros_like(self.v, dtype=bool)
        self.u_active[:, 1:-1] = self.wet[:, :-1] & self.wet[:, 1:]
        self.v_active[1:-1, :] = self.wet[:-1, :] & self.wet[1:, :]
        # Open faces are active regardless of position (edge or interior apron).
        if self.ou_idx.size:
            self.u_active[self.ou_idx[:, 0], self.ou_idx[:, 1]] = True
        if self.ov_idx.size:
            self.v_active[self.ov_idx[:, 0], self.ov_idx[:, 1]] = True

        cmax = np.sqrt(G * float(np.max(self.H[self.wet])))
        self.dt = config.cfl / np.sqrt((cmax / self.dx) ** 2 + (cmax / self.dy) ** 2)
        self.coriolis = 2.0 * OMEGA * np.sin(np.deg2rad(config.latitude_deg)) if config.use_coriolis else 0.0
        self.time_s = 0.0

        # Backend selection. GPU (CuPy) and the Numba CPU kernel are two
        # different ways to run the same vectorized math fast; they're
        # mutually exclusive. Everything above this point (mask/index
        # construction) is a tiny one-time setup cost and deliberately
        # stays on the CPU/NumPy even in GPU mode -- looping over individual
        # GPU array elements in Python would be far slower than the whole
        # simulation it's setting up.
        self._numba = None
        self.xp = np
        gpu_ok = False
        if config.use_gpu:
            try:
                import cupy as cp

                cp.cuda.runtime.getDeviceCount()  # raises if no working CUDA device/runtime
                gpu_ok = True
            except Exception as exc:
                # Graceful fallback (matches the Numba ImportError handling
                # below): a machine without CuPy, a CUDA driver, or a
                # working NVRTC (see docs/LIMITATIONS.md "GPU backend")
                # shouldn't hard-fail a run that otherwise works fine on
                # the CPU -- this is meant to be portable across machines,
                # not just the one it was developed on.
                import warnings

                warnings.warn(
                    f"use_gpu=True but CuPy/CUDA isn't usable ({exc!r}); falling back to "
                    "the CPU (Numba) path.", RuntimeWarning, stacklevel=2,
                )
        if gpu_ok:
            self.xp = cp
            self.H = cp.asarray(self.H)
            self.eta = cp.asarray(self.eta)
            self.u = cp.asarray(self.u)
            self.v = cp.asarray(self.v)
            self.wet = cp.asarray(self.wet)
            self.u_active = cp.asarray(self.u_active)
            self.v_active = cp.asarray(self.v_active)
            self.ou_idx = cp.asarray(self.ou_idx)
            self.ou_jc = cp.asarray(self.ou_jc)
            self.ou_s = cp.asarray(self.ou_s)
            self.ov_idx = cp.asarray(self.ov_idx)
            self.ov_ic = cp.asarray(self.ov_ic)
            self.ov_s = cp.asarray(self.ov_s)

            from app.sdbay.solver_gpu_kernels import GpuKernels

            self._gpu_kernels = GpuKernels(self.ny, self.nx)

        # Reusable scratch buffers (avoid per-step allocation in the hot loop).
        self._h_buf = self.xp.zeros_like(self.H)
        self._hu_buf = self.xp.zeros_like(self.u)
        self._hv_buf = self.xp.zeros_like(self.v)
        self._v_at_u_buf = self.xp.zeros_like(self.u)
        self._u_at_v_buf = self.xp.zeros_like(self.v)

        # Optional Numba fast path (see solver_numba.py); CPU-only, so only
        # considered when GPU mode wasn't requested. Falls back to the
        # NumPy implementation if numba is unavailable. The Numba kernel
        # supports arbitrary open faces via the same flat index arrays.
        if config.use_numba and not gpu_ok:
            try:
                from app.sdbay import solver_numba

                self._numba = solver_numba
                # C-contiguous float64 buffers the kernel writes in place.
                self.H = np.ascontiguousarray(self.H)
                self.eta = np.ascontiguousarray(self.eta)
                self.u = np.ascontiguousarray(self.u)
                self.v = np.ascontiguousarray(self.v)
                self.wet = np.ascontiguousarray(self.wet)
                self.u_active = np.ascontiguousarray(self.u_active)
                self.v_active = np.ascontiguousarray(self.v_active)
                self._du_buf = np.zeros_like(self.u)
                self._dv_buf = np.zeros_like(self.v)
            except ImportError:
                self._numba = None

    def _build_open_face_index(self) -> None:
        """From the open-face boolean masks, build flat arrays of open faces
        with their interior (wet) cell and the sign that makes positive
        face-velocity point *into* the domain. A face is only kept if it
        borders exactly one wet interior cell (the other side being the
        exterior ocean/nodata)."""
        ui, uj = np.where(self.ou_face)
        ujc = np.empty(ui.shape, dtype=np.int64)
        us = np.empty(ui.shape, dtype=np.float64)
        keep = np.zeros(ui.shape, dtype=bool)
        for k in range(ui.size):
            i, j = int(ui[k]), int(uj[k])
            east_wet = j < self.nx and self.wet[i, j]
            west_wet = j - 1 >= 0 and self.wet[i, j - 1]
            if east_wet and not west_wet:
                ujc[k], us[k], keep[k] = j, 1.0, True       # interior east, +u is inward
            elif west_wet and not east_wet:
                ujc[k], us[k], keep[k] = j - 1, -1.0, True  # interior west, +u is outward
        self.ou_idx = np.stack([ui[keep], uj[keep]], axis=1).astype(np.int64) if keep.any() else np.zeros((0, 2), np.int64)
        self.ou_jc = ujc[keep].astype(np.int64)
        self.ou_s = us[keep]

        vi, vj = np.where(self.ov_face)
        vic = np.empty(vi.shape, dtype=np.int64)
        vs = np.empty(vi.shape, dtype=np.float64)
        keepv = np.zeros(vi.shape, dtype=bool)
        for k in range(vi.size):
            i, j = int(vi[k]), int(vj[k])
            north_wet = i - 1 >= 0 and self.wet[i - 1, j]   # cell above the face
            south_wet = i < self.ny and self.wet[i, j]      # cell below the face
            if north_wet and not south_wet:
                vic[k], vs[k], keepv[k] = i - 1, 1.0, True   # interior north, +v(north) is inward
            elif south_wet and not north_wet:
                vic[k], vs[k], keepv[k] = i, -1.0, True      # interior south, +v(north) is outward
        self.ov_idx = np.stack([vi[keepv], vj[keepv]], axis=1).astype(np.int64) if keepv.any() else np.zeros((0, 2), np.int64)
        self.ov_ic = vic[keepv].astype(np.int64)
        self.ov_s = vs[keepv]

    def _face_depths(self) -> tuple[np.ndarray, np.ndarray]:
        xp = self.xp
        h = self._h_buf
        xp.add(self.H, self.eta, out=h)
        xp.maximum(h, self.cfg.hmin_m, out=h)
        h[~self.wet] = 0.0
        hu = self._hu_buf
        hv = self._hv_buf
        hu.fill(0.0)
        hv.fill(0.0)
        hu[:, 1:-1] = 0.5 * (h[:, :-1] + h[:, 1:])
        hv[1:-1, :] = 0.5 * (h[:-1, :] + h[1:, :])
        # Open faces carry the full interior-cell water depth.
        if self.ou_idx.size:
            hu[self.ou_idx[:, 0], self.ou_idx[:, 1]] = h[self.ou_idx[:, 0], self.ou_jc]
        if self.ov_idx.size:
            hv[self.ov_idx[:, 0], self.ov_idx[:, 1]] = h[self.ov_ic, self.ov_idx[:, 1]]
        return hu, hv

    def _apply_coriolis(self) -> None:
        if self.coriolis == 0.0:
            return
        v_cell = 0.5 * (self.v[:-1, :] + self.v[1:, :])
        v_at_u = self._v_at_u_buf
        v_at_u.fill(0.0)
        v_at_u[:, 1:-1] = 0.5 * (v_cell[:, :-1] + v_cell[:, 1:])
        u_cell = 0.5 * (self.u[:, :-1] + self.u[:, 1:])
        u_at_v = self._u_at_v_buf
        u_at_v.fill(0.0)
        u_at_v[1:-1, :] = 0.5 * (u_cell[:-1, :] + u_cell[1:, :])
        self.u += self.coriolis * self.dt * v_at_u
        self.v -= self.coriolis * self.dt * u_at_v

    def _apply_viscosity(self) -> None:
        nu = self.cfg.viscosity_m2s
        if nu <= 0.0:
            return
        lap_u = self.xp.zeros_like(self.u)
        lap_u[:, 1:-1] = (
            (self.u[:, 2:] - 2 * self.u[:, 1:-1] + self.u[:, :-2]) / self.dx**2
        )
        lap_v = self.xp.zeros_like(self.v)
        lap_v[1:-1, :] = (
            (self.v[2:, :] - 2 * self.v[1:-1, :] + self.v[:-2, :]) / self.dy**2
        )
        self.u += nu * self.dt * lap_u
        self.v += nu * self.dt * lap_v

    def _apply_advection(self) -> None:
        """First-order upwind momentum advection: -(u du/dx + v du/dy) for
        u, -(u dv/dx + v dv/dy) for v. This is what lets the model produce
        the nonlinear jetting/flow-separation behavior (speedup through
        constrictions, recirculation behind points) that a purely linear
        (pressure gradient + Coriolis + drag) scheme structurally cannot —
        see docs/LIMITATIONS.md. Upwind, not centered, for stability without
        added numerical viscosity.

        As with the pressure-gradient/continuity terms, the y/row axis is
        the mirror image of x/col: row index increases south but "north" is
        the positive-y convention for v, so a term evaluated "ahead" in the
        (positive) flow direction along y sits at row i-1, not row i+1, for
        northward (v>=0) flow.
        """
        xp = self.xp
        u, v = self.u, self.v
        dx, dy = self.dx, self.dy

        # --- u-momentum: u du/dx + v du/dy, upwind, interior faces j=1..nx-1 ---
        uc = u[:, 1:-1]
        dudx = xp.where(
            uc >= 0.0,
            (u[:, 1:-1] - u[:, :-2]) / dx,
            (u[:, 2:] - u[:, 1:-1]) / dx,
        )
        v_cell = 0.5 * (v[:-1, :] + v[1:, :])
        v_at_u = xp.zeros_like(u)
        v_at_u[:, 1:-1] = 0.5 * (v_cell[:, :-1] + v_cell[:, 1:])
        vc = v_at_u[:, 1:-1]
        dudy = xp.zeros_like(uc)
        back = (u[1:-1, 1:-1] - u[2:, 1:-1]) / dy   # rows 1..ny-2: value here minus the south (upwind for v>=0)
        fwd = (u[:-2, 1:-1] - u[1:-1, 1:-1]) / dy   # value north minus here (upwind for v<0)
        dudy[1:-1, :] = xp.where(vc[1:-1, :] >= 0.0, back, fwd)
        self.u[:, 1:-1] -= self.dt * (uc * dudx + vc * dudy)

        # --- v-momentum: u dv/dx + v dv/dy, upwind, interior faces i=1..ny-1 ---
        vc2 = v[1:-1, :]
        back_v = (v[1:-1, :] - v[2:, :]) / dy       # value here minus south (upwind for v>=0)
        fwd_v = (v[:-2, :] - v[1:-1, :]) / dy       # value north minus here (upwind for v<0)
        dvdy = xp.where(vc2 >= 0.0, back_v, fwd_v)
        u_cell = 0.5 * (u[:, :-1] + u[:, 1:])
        u_at_v = xp.zeros_like(v)
        u_at_v[1:-1, :] = 0.5 * (u_cell[:-1, :] + u_cell[1:, :])
        uc2 = u_at_v[1:-1, :]
        dvdx = xp.zeros_like(vc2)
        dvdx[:, 1:-1] = xp.where(
            uc2[:, 1:-1] >= 0.0,
            (v[1:-1, 1:-1] - v[1:-1, :-2]) / dx,
            (v[1:-1, 2:] - v[1:-1, 1:-1]) / dx,
        )
        self.v[1:-1, :] -= self.dt * (uc2 * dvdx + vc2 * dvdy)

    def step(self, exterior_eta_m: float, exterior_normal_velocity_mps: float = 0.0) -> None:
        """Advance one step.

        ``exterior_eta_m`` is a sea-level anomaly at the open boundary,
        referenced to the same vertical datum as ``depth_m`` (MLLW).
        ``exterior_normal_velocity_mps`` is positive into the domain.
        """
        if self._numba is not None:
            self._numba.step_kernel(
                self.H, self.eta, self.wet,
                self.u, self.v, self.u_active, self.v_active,
                self._hu_buf, self._hv_buf, self._du_buf, self._dv_buf,
                self.dx, self.dy, self.dt, self.cfg.drag_cd, self.cfg.hmin_m,
                self.coriolis, self.cfg.viscosity_m2s, self.cfg.use_advection,
                self.ou_idx, self.ou_jc, self.ou_s,
                self.ov_idx, self.ov_ic, self.ov_s,
                float(exterior_eta_m), float(exterior_normal_velocity_mps),
            )
            self.time_s += self.dt
            return

        if self.xp is not np:
            self._step_gpu(exterior_eta_m, exterior_normal_velocity_mps)
            self.time_s += self.dt
            return

        hu, hv = self._face_depths()

        self.u[:, 1:-1] -= G * self.dt / self.dx * (self.eta[:, 1:] - self.eta[:, :-1])
        # v is northward-positive but row index increases southward (row 0
        # = north), so both the pressure-gradient term here and the
        # continuity divergence term below use the mirror-image sign of
        # their u/x counterparts: the "ahead" cell in the positive-v
        # (north) direction is row i-1, not row i. Getting only one of the
        # two flipped (momentum without continuity, or vice versa) is
        # numerically unstable -- it stops being the adjoint pairing that
        # keeps the scheme energy-bounded -- confirmed empirically: with
        # only one flipped, interior eta grows without bound under a real
        # north/south open boundary even though it looks deceptively
        # bounded over a short run.
        self.v[1:-1, :] -= G * self.dt / self.dy * (self.eta[:-1, :] - self.eta[1:, :])
        if self.cfg.use_advection:
            self._apply_advection()
        self._apply_coriolis()
        self._apply_viscosity()

        denom_u = 1.0 + self.dt * self.cfg.drag_cd * self.xp.abs(self.u[:, 1:-1]) / self.xp.maximum(hu[:, 1:-1], self.cfg.hmin_m)
        self.u[:, 1:-1] /= denom_u
        denom_v = 1.0 + self.dt * self.cfg.drag_cd * self.xp.abs(self.v[1:-1, :]) / self.xp.maximum(hv[1:-1, :], self.cfg.hmin_m)
        self.v[1:-1, :] /= denom_v
        self.u[~self.u_active] = 0.0
        self.v[~self.v_active] = 0.0

        self._apply_open_boundary(hu, hv, exterior_eta_m, exterior_normal_velocity_mps)

        fu = hu * self.u
        fv = hv * self.v
        divergence = (fu[:, 1:] - fu[:, :-1]) / self.dx - (fv[1:, :] - fv[:-1, :]) / self.dy
        self.eta[self.wet] -= self.dt * divergence[self.wet]
        self.eta[~self.wet] = 0.0
        self.time_s += self.dt

    def _step_gpu(self, exterior_eta_m: float, exterior_normal_velocity_mps: float) -> None:
        """GPU step via fused CuPy RawKernels (see solver_gpu_kernels.py).

        Physically equivalent to the CPU step above (same terms, same
        signs, same sequential update order for cross-terms -- pressure
        gradient applied to u and v first, then advection, then Coriolis,
        then viscosity, matching solver_numba.py's order exactly rather
        than a naive "everything from one snapshot" fusion, which was
        tried first and found to disagree with the CPU path by ~50%: an
        early, more aggressively fused version let advection read the
        pre-pressure-gradient velocity instead of the updated one).
        Consolidates the ~15-20 separate elementwise CuPy ops the plain
        vectorized GPU path would use into ~10 kernel launches; on Windows
        (WDDM), per-launch driver overhead dominates at this problem size,
        so naively vectorized CuPy is actually *slower* than the
        single-fused-loop Numba CPU kernel (measured: 8.3ms/step vs
        5.8ms/step) -- this path exists to fix that.
        """
        xp = self.xp
        hu, hv = self._hu_buf, self._hv_buf
        self._gpu_kernels.compute_face_depths(self.H, self.eta, self.wet, self.cfg.hmin_m, hu, hv)
        # Open faces carry the full interior-cell water depth, not a
        # neighbor average (see solver.py's _face_depths for the CPU
        # equivalent) -- small sparse op, same pattern as
        # _apply_open_boundary below.
        if self.ou_idx.size or self.ov_idx.size:
            h = xp.maximum(self.H + self.eta, self.cfg.hmin_m)
            h = xp.where(self.wet, h, 0.0)
            if self.ou_idx.size:
                hu[self.ou_idx[:, 0], self.ou_idx[:, 1]] = h[self.ou_idx[:, 0], self.ou_jc]
            if self.ov_idx.size:
                hv[self.ov_idx[:, 0], self.ov_idx[:, 1]] = h[self.ov_ic, self.ov_idx[:, 1]]

        self._gpu_kernels.run_momentum_drag(
            self.H, self.eta, self.wet, self.u, self.v, self.u_active, self.v_active, hu, hv,
            self.dx, self.dy, self.dt, self.cfg.drag_cd, self.cfg.hmin_m,
            self.coriolis, self.cfg.viscosity_m2s, self.cfg.use_advection,
        )
        self._apply_open_boundary(hu, hv, exterior_eta_m, exterior_normal_velocity_mps)
        self._gpu_kernels.continuity_k(
            ((self.ny * self.nx + 255) // 256,), (256,),
            (self.eta, self.wet, self.u, self.v, hu, hv, self.dx, self.dy, self.dt, self.ny, self.nx),
        )

    def _apply_open_boundary(self, hu: np.ndarray, hv: np.ndarray, exterior_eta_m: float, exterior_normal_velocity_mps: float) -> None:
        """Flather radiation condition applied per open face (permits both
        inflow and outflow, unlike a hard elevation clamp). The face velocity
        is set so that ``sign`` * (velocity) is the inward normal:

            face_vel = s * ext_vel + s * sqrt(g/h) * (ext_eta - eta_interior)

        where ``s`` is +1 when positive face velocity already points into the
        domain and -1 otherwise, and ``h`` is the interior cell water depth.
        Works for a full grid edge or an arbitrary interior apron
        cross-section identically."""
        xp = self.xp
        if self.ou_idx.size:
            ii = self.ou_idx[:, 0]
            jj = self.ou_idx[:, 1]
            eint = self.eta[ii, self.ou_jc]
            hint = xp.maximum(self.H[ii, self.ou_jc] + eint, self.cfg.hmin_m)
            self.u[ii, jj] = self.ou_s * exterior_normal_velocity_mps + self.ou_s * xp.sqrt(G / hint) * (exterior_eta_m - eint)
        if self.ov_idx.size:
            ii = self.ov_idx[:, 0]
            jj = self.ov_idx[:, 1]
            eint = self.eta[self.ov_ic, jj]
            hint = xp.maximum(self.H[self.ov_ic, jj] + eint, self.cfg.hmin_m)
            self.v[ii, jj] = self.ov_s * exterior_normal_velocity_mps + self.ov_s * xp.sqrt(G / hint) * (exterior_eta_m - eint)

    def centered_velocity(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Always returns plain NumPy arrays, even in GPU mode -- this is the
        boundary where results leave the model for the rest of the (NumPy/
        pandas/matplotlib) pipeline."""
        xp = self.xp
        ue = 0.5 * (self.u[:, :-1] + self.u[:, 1:])
        vn = 0.5 * (self.v[:-1, :] + self.v[1:, :])
        speed = xp.hypot(ue, vn)
        ue = xp.where(self.wet, ue, np.nan)
        vn = xp.where(self.wet, vn, np.nan)
        speed = xp.where(self.wet, speed, np.nan)
        if xp is not np:
            ue, vn, speed = xp.asnumpy(ue), xp.asnumpy(vn), xp.asnumpy(speed)
        return ue, vn, speed

    def total_volume(self) -> float:
        """Total water volume (m^3) over wet cells; for closed-domain mass checks."""
        h = self.xp.where(self.wet, self.H + self.eta, 0.0)
        return float(self.xp.sum(h) * self.dx * self.dy)

    def eta_numpy(self) -> np.ndarray:
        """A plain-NumPy snapshot of eta, regardless of backend -- use this
        (not ``self.eta`` directly) wherever a copy needs to leave the model,
        e.g. for a saved map frame."""
        return self.eta.copy() if self.xp is np else self.xp.asnumpy(self.eta)

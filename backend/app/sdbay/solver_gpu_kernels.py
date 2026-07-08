"""Fused CUDA kernels (CuPy RawKernel / NVRTC) for the GPU backend.

The plain CuPy path in ``solver.py`` (``self.xp = cupy``) is correct but
launches ~20-30 small elementwise kernels per step; on Windows (WDDM) the
per-launch driver overhead dominates at this problem size and makes it
*slower* than the single-fused-loop Numba CPU kernel (measured: 8.3ms/step
GPU vs 5.8ms/step CPU on the real 20m grid). These RawKernels consolidate
work into fewer, larger launches while precisely matching the CPU
(solver.py / solver_numba.py) reference's *sequential* update order: the
reference applies the pressure-gradient to u and v first, and everything
downstream (advection, Coriolis, viscosity) reads those already-updated
values, not the pre-step snapshot -- so kernels below are ordered and
committed the same way (pressure-grad, then advection, then Coriolis, then
viscosity, then drag+mask), never fused across a phase boundary that the
reference itself treats as sequential. This was verified empirically: an
earlier, more aggressively fused version (single kernel doing
pressure-grad+advection+Coriolis+viscosity from one snapshot) disagreed
with the CPU reference by ~50%, not a small second-order difference --
advection's own coefficient must see the post-pressure-gradient velocity,
not the pre-step one.

Kernels that only read neighboring cells of a field they also write (the
advection/viscosity stencils) write to a separate scratch buffer and get
committed back before the next phase launches, to stay race-free within a
single kernel invocation. Kernels that only touch their own index, or read
a field the same launch doesn't modify (pressure-gradient reads only eta;
Coriolis's u-update reads only v and vice versa; drag/mask), update in
place safely.
"""
from __future__ import annotations

import cupy as cp

_PRESSURE_GRAD_U = r"""
extern "C" __global__
void pressure_grad_u(double* u, const double* eta, int ny, int nx,
                      double dx, double dt, double g) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = ny * (nx - 1);
    if (idx >= total) return;
    int i = idx / (nx - 1);
    int j = idx % (nx - 1) + 1;
    int uidx = i * (nx + 1) + j;
    u[uidx] -= g * dt / dx * (eta[i*nx + j] - eta[i*nx + j - 1]);
}
"""

_PRESSURE_GRAD_V = r"""
extern "C" __global__
void pressure_grad_v(double* v, const double* eta, int ny, int nx,
                      double dy, double dt, double g) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = (ny - 1) * nx;
    if (idx >= total) return;
    int i = idx / nx + 1;
    int j = idx % nx;
    int vidx = i * nx + j;
    v[vidx] -= g * dt / dy * (eta[(i-1)*nx + j] - eta[i*nx + j]);
}
"""

_ADVECT_U = r"""
extern "C" __global__
void advect_u(const double* u, const double* v, double* u_out, int ny, int nx,
              double dx, double dy, double dt) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = ny * (nx - 1);
    if (idx >= total) return;
    int i = idx / (nx - 1);
    int j = idx % (nx - 1) + 1;
    int uidx = i * (nx + 1) + j;

    double uc = u[uidx];
    double dudx = (uc >= 0.0)
        ? (u[uidx] - u[uidx - 1]) / dx
        : (u[uidx + 1] - u[uidx]) / dx;
    double vc_l = 0.5 * (v[i*nx + (j-1)] + v[(i+1)*nx + (j-1)]);
    double vc_r = 0.5 * (v[i*nx + j] + v[(i+1)*nx + j]);
    double vc = 0.5 * (vc_l + vc_r);
    double dudy = 0.0;
    if (i >= 1 && i <= ny - 2) {
        dudy = (vc >= 0.0)
            ? (u[uidx] - u[uidx + (nx+1)]) / dy
            : (u[uidx - (nx+1)] - u[uidx]) / dy;
    }
    u_out[uidx] = u[uidx] - dt * (uc * dudx + vc * dudy);
}
"""

_ADVECT_V = r"""
extern "C" __global__
void advect_v(const double* u, const double* v, double* v_out, int ny, int nx,
              double dx, double dy, double dt) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = (ny - 1) * nx;
    if (idx >= total) return;
    int i = idx / nx + 1;
    int j = idx % nx;
    int vidx = i * nx + j;

    double vc = v[vidx];
    double dvdy = (vc >= 0.0)
        ? (v[vidx] - v[vidx + nx]) / dy
        : (v[vidx - nx] - v[vidx]) / dy;
    double uc_t = 0.5 * (u[(i-1)*(nx+1) + j] + u[(i-1)*(nx+1) + j+1]);
    double uc_b = 0.5 * (u[i*(nx+1) + j] + u[i*(nx+1) + j+1]);
    double uc = 0.5 * (uc_t + uc_b);
    double dvdx = 0.0;
    if (j >= 1 && j <= nx - 2) {
        dvdx = (uc >= 0.0)
            ? (v[vidx] - v[vidx - 1]) / dx
            : (v[vidx + 1] - v[vidx]) / dx;
    }
    v_out[vidx] = v[vidx] - dt * (uc * dvdx + vc * dvdy);
}
"""

# Coriolis: Jacobi (simultaneous) in the reference itself (both v_at_u and
# u_at_v are computed from the same pre-Coriolis snapshot before either
# self.u or self.v is modified), so two independent in-place kernels here
# match it exactly -- neither reads a field the other writes.
_CORIOLIS_U = r"""
extern "C" __global__
void coriolis_u(double* u, const double* v, int ny, int nx,
                 double dt, double coriolis) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = ny * (nx - 1);
    if (idx >= total) return;
    int i = idx / (nx - 1);
    int j = idx % (nx - 1) + 1;
    int uidx = i * (nx + 1) + j;
    double vc_l = 0.5 * (v[i*nx + (j-1)] + v[(i+1)*nx + (j-1)]);
    double vc_r = 0.5 * (v[i*nx + j] + v[(i+1)*nx + j]);
    double v_at_u = 0.5 * (vc_l + vc_r);
    u[uidx] += coriolis * dt * v_at_u;
}
"""

_CORIOLIS_V = r"""
extern "C" __global__
void coriolis_v(double* v, const double* u, int ny, int nx,
                 double dt, double coriolis) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = (ny - 1) * nx;
    if (idx >= total) return;
    int i = idx / nx + 1;
    int j = idx % nx;
    int vidx = i * nx + j;
    double uc_t = 0.5 * (u[(i-1)*(nx+1) + j] + u[(i-1)*(nx+1) + j+1]);
    double uc_b = 0.5 * (u[i*(nx+1) + j] + u[i*(nx+1) + j+1]);
    double u_at_v = 0.5 * (uc_t + uc_b);
    v[vidx] -= coriolis * dt * u_at_v;
}
"""

_VISCOSITY_U = r"""
extern "C" __global__
void viscosity_u(const double* u, double* u_out, int ny, int nx,
                  double dx, double dt, double nu) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = ny * (nx - 1);
    if (idx >= total) return;
    int i = idx / (nx - 1);
    int j = idx % (nx - 1) + 1;
    int uidx = i * (nx + 1) + j;
    double lap = (u[uidx + 1] - 2.0*u[uidx] + u[uidx - 1]) / (dx*dx);
    u_out[uidx] = u[uidx] + nu * dt * lap;
}
"""

_VISCOSITY_V = r"""
extern "C" __global__
void viscosity_v(const double* v, double* v_out, int ny, int nx,
                  double dy, double dt, double nu) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = (ny - 1) * nx;
    if (idx >= total) return;
    int i = idx / nx + 1;
    int j = idx % nx;
    int vidx = i * nx + j;
    double lap = (v[vidx + nx] - 2.0*v[vidx] + v[vidx - nx]) / (dy*dy);
    v_out[vidx] = v[vidx] + nu * dt * lap;
}
"""

_FACE_DEPTHS_U = r"""
extern "C" __global__
void face_depths_u(const double* H, const double* eta, const bool* wet,
                    double hmin, int ny, int nx, double* hu) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = ny * (nx + 1);
    if (idx >= total) return;
    int i = idx / (nx + 1);
    int j = idx % (nx + 1);
    if (j == 0 || j == nx) { hu[idx] = 0.0; return; }
    double hl = H[i*nx + j-1] + eta[i*nx + j-1];
    if (hl < hmin) hl = hmin;
    if (!wet[i*nx + j-1]) hl = 0.0;
    double hr = H[i*nx + j] + eta[i*nx + j];
    if (hr < hmin) hr = hmin;
    if (!wet[i*nx + j]) hr = 0.0;
    hu[idx] = 0.5 * (hl + hr);
}
"""

_FACE_DEPTHS_V = r"""
extern "C" __global__
void face_depths_v(const double* H, const double* eta, const bool* wet,
                    double hmin, int ny, int nx, double* hv) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = (ny + 1) * nx;
    if (idx >= total) return;
    int i = idx / nx;
    int j = idx % nx;
    if (i == 0 || i == ny) { hv[idx] = 0.0; return; }
    double ht = H[(i-1)*nx + j] + eta[(i-1)*nx + j];
    if (ht < hmin) ht = hmin;
    if (!wet[(i-1)*nx + j]) ht = 0.0;
    double hb = H[i*nx + j] + eta[i*nx + j];
    if (hb < hmin) hb = hmin;
    if (!wet[i*nx + j]) hb = 0.0;
    hv[idx] = 0.5 * (ht + hb);
}
"""

_DRAG_MASK_U = r"""
extern "C" __global__
void drag_mask_u(double* u, const bool* u_active, const double* hu,
                  double hmin, double dt, double drag_cd, int ny, int nx) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = ny * (nx + 1);
    if (idx >= total) return;
    int j = idx % (nx + 1);
    if (j >= 1 && j <= nx - 1) {
        double hface = hu[idx];
        if (hface < hmin) hface = hmin;
        u[idx] /= 1.0 + dt * drag_cd * fabs(u[idx]) / hface;
    }
    if (!u_active[idx]) u[idx] = 0.0;
}
"""

_DRAG_MASK_V = r"""
extern "C" __global__
void drag_mask_v(double* v, const bool* v_active, const double* hv,
                  double hmin, double dt, double drag_cd, int ny, int nx) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = (ny + 1) * nx;
    if (idx >= total) return;
    int i = idx / nx;
    if (i >= 1 && i <= ny - 1) {
        double hface = hv[idx];
        if (hface < hmin) hface = hmin;
        v[idx] /= 1.0 + dt * drag_cd * fabs(v[idx]) / hface;
    }
    if (!v_active[idx]) v[idx] = 0.0;
}
"""

_CONTINUITY = r"""
extern "C" __global__
void continuity(double* eta, const bool* wet, const double* u, const double* v,
                 const double* hu, const double* hv,
                 double dx, double dy, double dt, int ny, int nx) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int total = ny * nx;
    if (idx >= total) return;
    int i = idx / nx;
    int j = idx % nx;
    if (!wet[idx]) { eta[idx] = 0.0; return; }
    int uidx = i * (nx + 1) + j;
    int vidx = i * nx + j;
    double fu_r = hu[uidx + 1] * u[uidx + 1];
    double fu_l = hu[uidx] * u[uidx];
    double fv_b = hv[vidx + nx] * v[vidx + nx];
    double fv_t = hv[vidx] * v[vidx];
    double div = (fu_r - fu_l) / dx - (fv_b - fv_t) / dy;
    eta[idx] -= dt * div;
}
"""

_BLOCK = 256


def _cfg(n: int) -> tuple[tuple[int], tuple[int]]:
    return ((n + _BLOCK - 1) // _BLOCK,), (_BLOCK,)


class GpuKernels:
    """Compiled RawKernel handles, built once per (ny, nx) model instance."""

    def __init__(self, ny: int, nx: int):
        self.ny = ny
        self.nx = nx
        self.face_depths_u = cp.RawKernel(_FACE_DEPTHS_U, "face_depths_u")
        self.face_depths_v = cp.RawKernel(_FACE_DEPTHS_V, "face_depths_v")
        self.pressure_grad_u = cp.RawKernel(_PRESSURE_GRAD_U, "pressure_grad_u")
        self.pressure_grad_v = cp.RawKernel(_PRESSURE_GRAD_V, "pressure_grad_v")
        self.advect_u = cp.RawKernel(_ADVECT_U, "advect_u")
        self.advect_v = cp.RawKernel(_ADVECT_V, "advect_v")
        self.coriolis_u = cp.RawKernel(_CORIOLIS_U, "coriolis_u")
        self.coriolis_v = cp.RawKernel(_CORIOLIS_V, "coriolis_v")
        self.viscosity_u = cp.RawKernel(_VISCOSITY_U, "viscosity_u")
        self.viscosity_v = cp.RawKernel(_VISCOSITY_V, "viscosity_v")
        self.drag_mask_u = cp.RawKernel(_DRAG_MASK_U, "drag_mask_u")
        self.drag_mask_v = cp.RawKernel(_DRAG_MASK_V, "drag_mask_v")
        self.continuity_k = cp.RawKernel(_CONTINUITY, "continuity")
        self._u_scratch = None
        self._v_scratch = None

    def compute_face_depths(self, H, eta, wet, hmin, hu, hv):
        """Interior-average face depths only. The caller (solver.py's
        _step_gpu) applies the open-boundary-face depth override (interior
        cell's own water column, not a neighbor average) afterward via
        small CuPy fancy-indexing ops on the sparse open-face lists --
        forgetting that override was an earlier, real bug here: without it,
        continuity flux at every open face used the wrong depth, corrupting
        eta right at the boundary and propagating outward."""
        ny, nx = self.ny, self.nx
        self.face_depths_u(*_cfg(ny*(nx+1)), (H, eta, wet, hmin, ny, nx, hu))
        self.face_depths_v(*_cfg((ny+1)*nx), (H, eta, wet, hmin, ny, nx, hv))

    def run_momentum_drag(self, H, eta, wet, u, v, u_active, v_active, hu, hv,
                           dx, dy, dt, drag_cd, hmin, coriolis, viscosity, use_advection):
        ny, nx = self.ny, self.nx
        g = 9.80665
        if self._u_scratch is None:
            self._u_scratch = cp.zeros_like(u)
            self._v_scratch = cp.zeros_like(v)
        u_scratch, v_scratch = self._u_scratch, self._v_scratch

        # Pressure gradient: safe in place (reads only eta).
        self.pressure_grad_u(*_cfg(ny*(nx-1)), (u, eta, ny, nx, dx, dt, g))
        self.pressure_grad_v(*_cfg((ny-1)*nx), (v, eta, ny, nx, dy, dt, g))

        # Advection: reads neighbors of the field it updates -> scratch + commit.
        # v's kernel must run after u's commit, matching the CPU reference
        # (advect_v's cross-term reads u post-advect_u).
        if use_advection:
            self.advect_u(*_cfg(ny*(nx-1)), (u, v, u_scratch, ny, nx, dx, dy, dt))
            u[:, 1:-1] = u_scratch[:, 1:-1]
            self.advect_v(*_cfg((ny-1)*nx), (u, v, v_scratch, ny, nx, dx, dy, dt))
            v[1:-1, :] = v_scratch[1:-1, :]

        # Coriolis: Jacobi in the reference too (each reads the other's
        # *unmodified* field) -- two independent in-place kernels is exact.
        if coriolis != 0.0:
            self.coriolis_u(*_cfg(ny*(nx-1)), (u, v, ny, nx, dt, coriolis))
            self.coriolis_v(*_cfg((ny-1)*nx), (v, u, ny, nx, dt, coriolis))

        if viscosity > 0.0:
            self.viscosity_u(*_cfg(ny*(nx-1)), (u, u_scratch, ny, nx, dx, dt, viscosity))
            u[:, 1:-1] = u_scratch[:, 1:-1]
            self.viscosity_v(*_cfg((ny-1)*nx), (v, v_scratch, ny, nx, dy, dt, viscosity))
            v[1:-1, :] = v_scratch[1:-1, :]

        self.drag_mask_u(*_cfg(ny*(nx+1)), (u, u_active, hu, hmin, dt, drag_cd, ny, nx))
        self.drag_mask_v(*_cfg((ny+1)*nx), (v, v_active, hv, hmin, dt, drag_cd, ny, nx))

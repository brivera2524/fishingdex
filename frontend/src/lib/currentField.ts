import type { VelocityLayerRecord } from "leaflet";
import { cachedFetch } from "./ttlCache";

// A grid covering San Diego's coastal + bay waters (Point Loma up through
// La Jolla/Del Mar, plus Mission Bay and San Diego Bay) — narrower than the
// full county bounding box used for tile prefetching, since current data
// only means anything over water. Resolution is coarser than the model's
// native ~9km grid would need (Open-Meteo returns the same underlying value
// for points that round to the same model cell either way); this just
// controls how many interpolation nodes leaflet-velocity's particle field
// has to work with.
const GRID = {
  lo1: -117.35, // west
  la1: 33.0, // north (origin row)
  lo2: -117.05, // east
  la2: 32.5, // south
  dx: 0.025,
  dy: 0.05,
};
const NX = Math.round((GRID.lo2 - GRID.lo1) / GRID.dx) + 1;
const NY = Math.round((GRID.la1 - GRID.la2) / GRID.dy) + 1;

const FIELD_TTL_MS = 30 * 60 * 1000;

// Row-major, row 0 = la1 (north) going south, each row west (lo1) to east —
// the exact order leaflet-velocity's data arrays are expected in (matching
// its `j = (la1 - lat) / dy` / `i = (lng - lo1) / dx` indexing).
function buildGridPoints(): { lats: number[]; lngs: number[] } {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (let row = 0; row < NY; row++) {
    const lat = GRID.la1 - row * GRID.dy;
    for (let col = 0; col < NX; col++) {
      lats.push(lat);
      lngs.push(GRID.lo1 + col * GRID.dx);
    }
  }
  return { lats, lngs };
}

function buildHeader(parameterNumber: 2 | 3): VelocityLayerRecord["header"] {
  return {
    parameterCategory: 2,
    parameterNumber,
    nx: NX,
    ny: NY,
    lo1: GRID.lo1,
    la1: GRID.la1,
    lo2: GRID.lo2,
    la2: GRID.la2,
    dx: GRID.dx,
    dy: GRID.dy,
    refTime: new Date().toISOString(),
    forecastTime: 0,
  };
}

// Open-Meteo's Marine Weather API supports batched multi-point queries via
// comma-separated lat/lng lists, returning results in the same order as the
// input — one request fetches the whole grid instead of nx*ny separate ones.
export function fetchCurrentField(): Promise<VelocityLayerRecord[] | null> {
  return cachedFetch("current-field:sd", FIELD_TTL_MS, async () => {
    const { lats, lngs } = buildGridPoints();
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats.join(",")}&longitude=${lngs.join(",")}&current=ocean_current_velocity,ocean_current_direction&wind_speed_unit=mph`;
    const res = await fetch(url);
    const points: Array<{ current?: { ocean_current_velocity?: number; ocean_current_direction?: number } }> =
      await res.json();
    if (!Array.isArray(points) || points.length !== lats.length) return null;

    const uData: number[] = [];
    const vData: number[] = [];
    for (const point of points) {
      const speed = point.current?.ocean_current_velocity;
      const direction = point.current?.ocean_current_direction;
      // Land points (or a gap in the model) come back null — treated as
      // zero flow rather than dropped, so the grid stays a fixed nx*ny
      // rectangle leaflet-velocity can index into.
      if (speed == null || direction == null) {
        uData.push(0);
        vData.push(0);
        continue;
      }
      const rad = (direction * Math.PI) / 180;
      uData.push(speed * Math.sin(rad)); // eastward component
      vData.push(speed * Math.cos(rad)); // northward component
    }

    return [
      { header: buildHeader(2), data: uData },
      { header: buildHeader(3), data: vData },
    ];
  });
}

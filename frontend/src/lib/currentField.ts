import type { CurrentGridRecord } from "../api/types";
import { getBayCurrentField, getCurrentField } from "../api/endpoints";
import { cachedFetch } from "./ttlCache";

// On top of the backend's own cache (see app/ocean_current.py) — avoids
// re-hitting our API every time the Map page remounts within a short window.
const FIELD_TTL_MS = 10 * 60 * 1000;

// Our renderer moves each particle by its (u, v) vector with no inherent
// floor — a genuinely near-zero vector just barely moves regardless of how
// aggressive the drift scale is, so slack/slow water (very common in this
// data — most speeds are 0.02-0.6 m/s) would read as completely static.
// Flooring the magnitude while preserving direction keeps slow cells
// visibly creeping without touching anything already moving faster than
// the floor. `null` (land/no-data, straight from the backend) is left
// untouched — the renderer treats it as "don't draw here."
const MIN_SPEED_MPS = 0.04;

function applySpeedFloor(u: Array<number | null>, v: Array<number | null>): void {
  for (let i = 0; i < u.length; i++) {
    const uu = u[i];
    const vv = v[i];
    if (uu == null || vv == null) continue;
    const magnitude = Math.hypot(uu, vv);
    if (magnitude > 0 && magnitude < MIN_SPEED_MPS) {
      const scale = MIN_SPEED_MPS / magnitude;
      u[i] = uu * scale;
      v[i] = vv * scale;
    }
  }
}

function prepareRecords(records: CurrentGridRecord[]): CurrentGridRecord[] {
  const uRecord = records.find((r) => r.header.parameterNumber === 2);
  const vRecord = records.find((r) => r.header.parameterNumber === 3);
  if (uRecord && vRecord) applySpeedFloor(uRecord.data, vRecord.data);

  return records;
}

export function fetchCurrentField(): Promise<CurrentGridRecord[] | null> {
  return cachedFetch("current-field", FIELD_TTL_MS, async () => {
    const records = await getCurrentField().catch(() => null);
    return records ? prepareRecords(records) : null;
  });
}

// HFRadar (above) has no usable coverage inside San Diego Bay — this fetches
// the tide-model simulation for the bay interior instead. Returns null
// while the model is still warming up after a deploy (see app/ocean_sim.py)
// or if the last run failed, so the caller can just skip rendering.
export function fetchBayCurrentField(): Promise<CurrentGridRecord[] | null> {
  return cachedFetch("bay-current-field", FIELD_TTL_MS, async () => {
    const field = await getBayCurrentField().catch(() => null);
    if (!field || field.status !== "ready" || !field.records) return null;
    return prepareRecords(field.records);
  });
}

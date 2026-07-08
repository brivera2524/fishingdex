import type { VelocityLayerRecord } from "leaflet";
import { getBayCurrentField, getCurrentField } from "../api/endpoints";
import { cachedFetch } from "./ttlCache";

// On top of the backend's own cache (see app/ocean_current.py) — avoids
// re-hitting our API every time the Map page remounts within a short window.
const FIELD_TTL_MS = 10 * 60 * 1000;

function nullToNaN(records: VelocityLayerRecord[]): VelocityLayerRecord[] {
  // JSON has no NaN literal, so the backend sends land/no-data cells as
  // null — leaflet-velocity's own missing-data convention is NaN, which
  // it already knows to skip drawing.
  for (const record of records) {
    record.data = record.data.map((value) => (value == null ? NaN : value));
  }
  return records;
}

export function fetchCurrentField(): Promise<VelocityLayerRecord[] | null> {
  return cachedFetch("current-field", FIELD_TTL_MS, async () => {
    const records = await getCurrentField().catch(() => null);
    return records ? nullToNaN(records) : null;
  });
}

// HFRadar (above) has no usable coverage inside San Diego Bay — this fetches
// the tide-model simulation for the bay interior instead. Returns null
// while the model is still warming up after a deploy (see app/ocean_sim.py)
// or if the last run failed, so the caller can just skip rendering.
export function fetchBayCurrentField(): Promise<VelocityLayerRecord[] | null> {
  return cachedFetch("bay-current-field", FIELD_TTL_MS, async () => {
    const field = await getBayCurrentField().catch(() => null);
    if (!field || field.status !== "ready" || !field.records) return null;
    return nullToNaN(field.records);
  });
}

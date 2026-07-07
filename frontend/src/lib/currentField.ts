import type { VelocityLayerRecord } from "leaflet";
import { getCurrentField } from "../api/endpoints";
import { cachedFetch } from "./ttlCache";

// On top of the backend's own cache (see app/ocean_current.py) — avoids
// re-hitting our API every time the Map page remounts within a short window.
const FIELD_TTL_MS = 10 * 60 * 1000;

export function fetchCurrentField(): Promise<VelocityLayerRecord[] | null> {
  return cachedFetch("current-field", FIELD_TTL_MS, async () => {
    const records = await getCurrentField().catch(() => null);
    if (!records) return null;
    // JSON has no NaN literal, so the backend sends land/no-data cells as
    // null — leaflet-velocity's own missing-data convention is NaN, which
    // it already knows to skip drawing.
    for (const record of records) {
      record.data = record.data.map((value) => (value == null ? NaN : value));
    }
    return records;
  });
}

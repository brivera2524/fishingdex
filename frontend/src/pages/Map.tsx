import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { getMapCatches } from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { MapCatch } from "../api/types";

// Vite bundles Leaflet's default marker image paths incorrectly out of the box.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const SAN_DIEGO: [number, number] = [32.7157, -117.1611];

export default function MapPage() {
  const [catches, setCatches] = useState<MapCatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMapCatches()
      .then(setCatches)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load map"))
      .finally(() => setLoading(false));
  }, []);

  const center: [number, number] =
    catches.length > 0 ? [catches[0].latitude, catches[0].longitude] : SAN_DIEGO;

  return (
    <div className="map-page">
      <div className="map-badge">
        {loading ? "Loading..." : error ? error : `${catches.length} catch${catches.length === 1 ? "" : "es"} on the map`}
      </div>
      <MapContainer center={center} zoom={11} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {catches.map((c) => (
          <Marker key={c.id} position={[c.latitude, c.longitude]}>
            <Popup>
              <strong>{c.species.common_name}</strong>
              <br />
              {c.display_name}
              {c.weight != null && ` — ${c.weight} lb`}
              <br />
              {new Date(c.caught_at).toLocaleDateString()}
              {c.photo_url && (
                <>
                  <br />
                  <img
                    src={`${API_BASE}${c.photo_url}`}
                    alt={c.species.common_name}
                    style={{ width: "100%", borderRadius: 8, marginTop: 6 }}
                  />
                </>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

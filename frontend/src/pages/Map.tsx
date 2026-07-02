import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { SAN_DIEGO } from "../leafletSetup";
import { getMapCatches } from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { MapCatch } from "../api/types";

interface FocusState {
  focusCatchId: number;
  latitude: number;
  longitude: number;
}

function FlyToFocus({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([latitude, longitude], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);
  return null;
}

export default function MapPage() {
  const location = useLocation();
  const focus = location.state as FocusState | null;
  const [catches, setCatches] = useState<MapCatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const markerRefs = useRef<Record<number, L.Marker | null>>({});

  useEffect(() => {
    getMapCatches()
      .then(setCatches)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load map"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!focus || loading) return;
    markerRefs.current[focus.focusCatchId]?.openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, loading, catches]);

  const center: [number, number] = focus
    ? [focus.latitude, focus.longitude]
    : catches.length > 0
      ? [catches[0].latitude, catches[0].longitude]
      : SAN_DIEGO;

  return (
    <div className="map-page">
      <div className="map-badge">
        {loading ? "Loading..." : error ? error : `${catches.length} catch${catches.length === 1 ? "" : "es"} on the map`}
      </div>
      <MapContainer center={center} zoom={focus ? 15 : 11} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {focus && <FlyToFocus latitude={focus.latitude} longitude={focus.longitude} />}
        <MarkerClusterGroup showCoverageOnHover={false}>
          {catches.map((c) => (
            <Marker
              key={c.id}
              position={[c.latitude, c.longitude]}
              ref={(instance) => {
                markerRefs.current[c.id] = instance;
              }}
            >
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
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { catchMarkerIcon, createClusterIcon, currentLocationIcon, SAN_DIEGO } from "../leafletSetup";
import { getMapCatches } from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { MapCatch } from "../api/types";
import type { LatLng } from "../components/LocationPicker";
import HeatmapLayer from "../components/HeatmapLayer";
import TideBadge from "../components/TideBadge";

interface FocusState {
  focusCatchId: number;
  latitude: number;
  longitude: number;
}

export default function MapPage() {
  const location = useLocation();
  const focus = location.state as FocusState | null;
  const [catches, setCatches] = useState<MapCatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinsEnabled, setPinsEnabled] = useState(true);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const markerRefs = useRef<Record<number, L.Marker | null>>({});
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    getMapCatches()
      .then(setCatches)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load map"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* No permission or unavailable — just don't show the indicator. */
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    if (!focus || loading) return;
    const marker = markerRefs.current[focus.focusCatchId];
    if (!marker) return;
    const clusterGroup = clusterGroupRef.current;
    if (!clusterGroup) {
      marker.openPopup();
      return;
    }
    // react-leaflet-cluster buffers addLayer calls and flushes them via
    // queueMicrotask instead of adding them synchronously on mount, so right
    // after a marker mounts it may not be registered in the cluster group's
    // internal tree yet (no `__parent` set). Calling zoomToShowLayer before
    // that flush runs throws inside the library (reading a property off
    // undefined) — queuing our own microtask lets that pending flush run
    // first. Still guarded with try/catch as a fallback to a plain
    // openPopup() rather than surfacing the app's error-boundary screen for
    // what's just a missed zoom-to-pin nicety.
    queueMicrotask(() => {
      try {
        // The marker may currently be hidden inside a cluster bubble —
        // zoomToShowLayer zooms/pans (and spiderfies if still too close at
        // max zoom) until it's actually on the map, then opens its popup.
        // Calling openPopup() directly wouldn't do anything visible while
        // the marker is still folded into a cluster.
        clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
      } catch {
        marker.openPopup();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, loading, catches]);

  const center: [number, number] = focus
    ? [focus.latitude, focus.longitude]
    : catches.length > 0
      ? [catches[0].latitude, catches[0].longitude]
      : SAN_DIEGO;

  const heatPoints: [number, number][] = catches.map((c) => [c.latitude, c.longitude]);
  // Always show pins once the map has zoomed in for a specific catch (via
  // "View on map"), regardless of the toggle — that flow's whole point is
  // to see that one pin.
  const showPins = pinsEnabled || Boolean(focus);

  return (
    <div className="map-page">
      <div className="map-layer-toggles">
        <button
          type="button"
          className={`map-layer-toggle${pinsEnabled ? " active" : ""}`}
          onClick={() => setPinsEnabled((v) => !v)}
        >
          📍 Pins
        </button>
        <button
          type="button"
          className={`map-layer-toggle${heatmapEnabled ? " active" : ""}`}
          onClick={() => setHeatmapEnabled((v) => !v)}
        >
          🔥 Heatmap
        </button>
      </div>
      <TideBadge />
      <div className="map-badge">
        {loading ? "Loading..." : error ? error : `${catches.length} catch${catches.length === 1 ? "" : "es"} on the map`}
      </div>
      <MapContainer center={center} zoom={focus ? 15 : 11} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {heatmapEnabled && <HeatmapLayer points={heatPoints} />}
        {showPins && (
          <MarkerClusterGroup
            ref={clusterGroupRef}
            showCoverageOnHover={false}
            maxClusterRadius={20}
            iconCreateFunction={createClusterIcon}
          >
            {catches.map((c) => (
              <Marker
                key={c.id}
                position={[c.latitude, c.longitude]}
                icon={catchMarkerIcon}
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
        )}
        {myLocation && (
          <Marker position={[myLocation.lat, myLocation.lng]} icon={currentLocationIcon} interactive={false} />
        )}
      </MapContainer>
    </div>
  );
}

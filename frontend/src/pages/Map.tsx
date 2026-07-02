import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { catchMarkerIcon, createClusterIcon, currentLocationIcon, SAN_DIEGO } from "../leafletSetup";
import { getMapCatches } from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { MapCatch, Species } from "../api/types";
import type { LatLng } from "../components/LocationPicker";
import { haversineDistanceKm } from "../geo";
import HeatmapLayer from "../components/HeatmapLayer";
import BottomSheet from "../components/BottomSheet";

interface FocusState {
  focusCatchId: number;
  latitude: number;
  longitude: number;
}

interface NearbySpeciesResult {
  species: Species;
  count: number;
  lastCaughtAt: string;
}

const NEARBY_RADIUS_KM = 3;
// Below this zoom, individual pins/clusters pile up densely enough to
// cover most of the heatmap underneath, so they're hidden until you're
// zoomed in past it — heat for the overview, pins for the close-up detail.
const PIN_VISIBLE_ZOOM = 13;

function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });
  return null;
}

function nearbySpeciesFrom(catches: MapCatch[], center: LatLng, radiusKm: number): NearbySpeciesResult[] {
  const bySpecies = new Map<number, NearbySpeciesResult>();
  for (const c of catches) {
    if (haversineDistanceKm(center, { lat: c.latitude, lng: c.longitude }) > radiusKm) continue;
    const existing = bySpecies.get(c.species.id);
    if (existing) {
      existing.count += 1;
      if (new Date(c.caught_at) > new Date(existing.lastCaughtAt)) existing.lastCaughtAt = c.caught_at;
    } else {
      bySpecies.set(c.species.id, { species: c.species, count: 1, lastCaughtAt: c.caught_at });
    }
  }
  return [...bySpecies.values()].sort((a, b) => b.count - a.count);
}

function NearMeOverlay({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([center.lat, center.lng], 13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);
  // Just the search-radius circle — the persistent currentLocationIcon
  // marker already marks "you are here" on the map at all times.
  return (
    <Circle
      center={[center.lat, center.lng]}
      radius={NEARBY_RADIUS_KM * 1000}
      pathOptions={{ color: "#2dd4bf", fillColor: "#2dd4bf", fillOpacity: 0.08, weight: 1.5 }}
    />
  );
}

export default function MapPage() {
  const location = useLocation();
  const focus = location.state as FocusState | null;
  const [catches, setCatches] = useState<MapCatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [currentZoom, setCurrentZoom] = useState(focus ? 15 : 11);
  const markerRefs = useRef<Record<number, L.Marker | null>>({});
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

  const [nearMeCenter, setNearMeCenter] = useState<LatLng | null>(null);
  const [nearMeResults, setNearMeResults] = useState<NearbySpeciesResult[] | null>(null);
  const [nearMeLoading, setNearMeLoading] = useState(false);
  const [nearMeError, setNearMeError] = useState<string | null>(null);

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

  function handleFindNearby() {
    if (!navigator.geolocation) {
      setNearMeError("Location isn't available on this device.");
      return;
    }
    setNearMeLoading(true);
    setNearMeError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setNearMeCenter(center);
        setNearMeResults(nearbySpeciesFrom(catches, center, NEARBY_RADIUS_KM));
        setNearMeLoading(false);
      },
      () => {
        setNearMeError("Couldn't get your location.");
        setNearMeLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }

  function closeNearMe() {
    setNearMeCenter(null);
    setNearMeResults(null);
    setNearMeError(null);
  }

  const center: [number, number] = focus
    ? [focus.latitude, focus.longitude]
    : catches.length > 0
      ? [catches[0].latitude, catches[0].longitude]
      : SAN_DIEGO;

  const heatPoints: [number, number][] = catches.map((c) => [c.latitude, c.longitude]);
  // Always show pins once the map has zoomed in for a specific catch (via
  // "View on map"), regardless of the gate — that flow's whole point is to
  // see that one pin.
  const showPins = !heatmapEnabled || Boolean(focus) || currentZoom >= PIN_VISIBLE_ZOOM;

  return (
    <div className="map-page">
      <button
        type="button"
        className={`map-heat-toggle${heatmapEnabled ? " active" : ""}`}
        onClick={() => setHeatmapEnabled((v) => !v)}
      >
        🔥 Heatmap
      </button>
      <div className="map-badge">
        {loading
          ? "Loading..."
          : error
            ? error
            : `${catches.length} catch${catches.length === 1 ? "" : "es"} on the map${showPins ? "" : " · zoom in for pins"}`}
      </div>
      <MapContainer center={center} zoom={focus ? 15 : 11} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomTracker onZoomChange={setCurrentZoom} />
        {heatmapEnabled && <HeatmapLayer points={heatPoints} />}
        {showPins && (
          <MarkerClusterGroup
            ref={clusterGroupRef}
            showCoverageOnHover={false}
            maxClusterRadius={40}
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
        {nearMeCenter && <NearMeOverlay center={nearMeCenter} />}
      </MapContainer>
      <button
        type="button"
        className="fab-floating"
        aria-label="What's biting near me"
        onClick={handleFindNearby}
        disabled={nearMeLoading || loading}
      >
        {nearMeLoading ? "…" : "📍"}
      </button>

      <BottomSheet open={nearMeResults != null || nearMeError != null} onClose={closeNearMe}>
        <div>
          <h1>Near you</h1>
          {nearMeError && <p className="error">{nearMeError}</p>}
          {nearMeResults && nearMeResults.length === 0 && (
            <p className="card-meta">No catches recorded within {NEARBY_RADIUS_KM} km of here yet.</p>
          )}
          {nearMeResults && nearMeResults.length > 0 && (
            <ul className="catch-list">
              {nearMeResults.map((r) => (
                <li key={r.species.id} className="card">
                  <div className="page-header">
                    <span className="card-title">{r.species.common_name}</span>
                    <span className="card-stat">
                      {r.count} catch{r.count === 1 ? "" : "es"}
                    </span>
                  </div>
                  <span className="card-meta">Last caught {new Date(r.lastCaughtAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

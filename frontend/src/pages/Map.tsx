import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";
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
import TimeWindowRuler from "../components/TimeWindowRuler";

interface FocusState {
  focusCatchId: number;
  latitude: number;
  longitude: number;
}

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 30;

const WINDOW_PRESETS = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "All", days: Infinity },
];

function formatRangeLabel(startDaysAgo: number, endDaysAgo: number) {
  const now = Date.now();
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const from = fmt(new Date(now - startDaysAgo * DAY_MS));
  return endDaysAgo < 0.5 ? `${from} – Today` : `${from} – ${fmt(new Date(now - endDaysAgo * DAY_MS))}`;
}

// Collapses the time panel as soon as the user starts panning the map —
// rendered inside MapContainer since Leaflet's event bus is only reachable
// from a descendant via useMapEvents.
function MapDragCollapse({ onDragStart }: { onDragStart: () => void }) {
  useMapEvents({ dragstart: onDragStart });
  return null;
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
  const [maxDaysSpan, setMaxDaysSpan] = useState(DEFAULT_WINDOW_DAYS);
  const [windowRange, setWindowRange] = useState({ start: DEFAULT_WINDOW_DAYS, end: 0 });
  const [scrollToken, setScrollToken] = useState(0);
  const [timeExpanded, setTimeExpanded] = useState(false);
  const markerRefs = useRef<Record<number, L.Marker | null>>({});
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    getMapCatches()
      .then((data) => {
        setCatches(data);
        const now = Date.now();
        const oldestAgeDays = data.reduce((max, c) => {
          const ageDays = (now - new Date(c.caught_at).getTime()) / DAY_MS;
          return ageDays > max ? ageDays : max;
        }, DEFAULT_WINDOW_DAYS);
        setMaxDaysSpan(Math.ceil(oldestAgeDays) + 1);
      })
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

  const startDaysAgo = Math.min(windowRange.start, maxDaysSpan);
  const endDaysAgo = windowRange.end;

  const visibleCatches = useMemo(() => {
    const now = Date.now();
    let list = catches.filter((c) => {
      const ageDays = (now - new Date(c.caught_at).getTime()) / DAY_MS;
      return ageDays <= startDaysAgo + 0.001 && ageDays >= endDaysAgo - 0.001;
    });
    // "View on map" should always be able to find its target pin, even if it
    // falls outside the currently selected time window.
    if (focus && !list.some((c) => c.id === focus.focusCatchId)) {
      const target = catches.find((c) => c.id === focus.focusCatchId);
      if (target) list = [...list, target];
    }
    return list;
  }, [catches, startDaysAgo, endDaysAgo, focus]);

  const center: [number, number] = focus
    ? [focus.latitude, focus.longitude]
    : visibleCatches.length > 0
      ? [visibleCatches[0].latitude, visibleCatches[0].longitude]
      : SAN_DIEGO;

  const heatPoints: [number, number][] = visibleCatches.map((c) => [c.latitude, c.longitude]);
  // Always show pins once the map has zoomed in for a specific catch (via
  // "View on map"), regardless of the toggle — that flow's whole point is
  // to see that one pin.
  const showPins = pinsEnabled || Boolean(focus);

  return (
    <div className="map-page">
      <TideBadge />
      <div className="map-badge">
        {loading
          ? "Loading..."
          : error
            ? error
            : `${visibleCatches.length} catch${visibleCatches.length === 1 ? "" : "es"} on the map`}
      </div>
      {/* Stacked as a single flex column, bottom-anchored, so the layer
          toggles stay pinned directly above the time panel and shift up or
          down with it as it expands/collapses, instead of both being pinned
          to independent fixed pixel offsets that drift apart. */}
      <div className="map-bottom-stack">
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
        {timeExpanded ? (
          <div className="map-time-panel">
            <div className="map-time-expanded-content">
              <div className="map-time-panel-header">
                <span className="map-time-panel-label">{formatRangeLabel(startDaysAgo, endDaysAgo)}</span>
                <div className="map-time-presets">
                  {WINDOW_PRESETS.map((preset) => {
                    const days = Math.min(preset.days, maxDaysSpan);
                    const active = startDaysAgo === days && endDaysAgo === 0;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        className={`map-time-preset${active ? " active" : ""}`}
                        onClick={() => {
                          setWindowRange({ start: days, end: 0 });
                          setScrollToken((t) => t + 1);
                          setTimeExpanded(true);
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <TimeWindowRuler
                maxDaysSpan={maxDaysSpan}
                startDaysAgo={startDaysAgo}
                endDaysAgo={endDaysAgo}
                onChange={(start, end) => {
                  setWindowRange({ start, end });
                  setTimeExpanded(true);
                }}
                scrollToken={scrollToken}
              />
            </div>
          </div>
        ) : (
          <button type="button" className="map-time-panel collapsed" onClick={() => setTimeExpanded(true)}>
            <span className="map-time-panel-label">🕐 {formatRangeLabel(startDaysAgo, endDaysAgo)}</span>
            <span className="map-time-collapsed-chevron">›</span>
          </button>
        )}
      </div>
      <MapContainer
        center={center}
        zoom={focus ? 15 : 11}
        className="map-container"
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapDragCollapse onDragStart={() => setTimeExpanded(false)} />
        {heatmapEnabled && <HeatmapLayer points={heatPoints} />}
        {showPins && (
          <MarkerClusterGroup
            ref={clusterGroupRef}
            showCoverageOnHover={false}
            maxClusterRadius={20}
            iconCreateFunction={createClusterIcon}
          >
            {visibleCatches.map((c) => (
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

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { MapContainer, Marker, Polygon, Popup, TileLayer, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { catchMarkerIcon, createClusterIcon, createWindClusterIcon, currentLocationIcon, SAN_DIEGO } from "../leafletSetup";
import { createSpot, deleteSpot, getMapCatches, listSpots } from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { MapCatch, Spot } from "../api/types";
import type { LatLng } from "../components/LocationPicker";
import HeatmapLayer from "../components/HeatmapLayer";
import TideBadge from "../components/TideBadge";
import TimeWindowRuler from "../components/TimeWindowRuler";
import WindBadge from "../components/WindBadge";
import WindDetailSheet from "../components/WindDetailSheet";
import SpotNameSheet from "../components/SpotNameSheet";
import { useAuth } from "../auth/AuthContext";

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

const MIN_SPOT_POINTS = 3;

// Lightweight tap-to-add-vertex polygon drawing — there's no leaflet-draw/
// leaflet-geoman in this app, so admin spot-drawing is built directly on
// react-leaflet's own click event plumbing (same useMapEvents hook family as
// MapDragCollapse above) rather than pulling in a whole drawing library for
// one feature.
function SpotDrawLayer({ onAddPoint }: { onAddPoint: (latlng: [number, number]) => void }) {
  useMapEvents({ click: (e) => onAddPoint([e.latlng.lat, e.latlng.lng]) });
  return null;
}

// Re-checks which wind badges are currently standalone (vs. folded into a
// cluster bubble) whenever the map finishes a zoom, so name labels can be
// gated on actual cluster membership rather than a fixed zoom threshold.
function WindClusterZoomSync({ onZoomEnd }: { onZoomEnd: () => void }) {
  useMapEvents({ zoomend: onZoomEnd });
  return null;
}

export default function MapPage() {
  const location = useLocation();
  const focus = location.state as FocusState | null;
  const { currentUser } = useAuth();
  const [catches, setCatches] = useState<MapCatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinsEnabled, setPinsEnabled] = useState(true);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [spotsEnabled, setSpotsEnabled] = useState(true);
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [maxDaysSpan, setMaxDaysSpan] = useState(DEFAULT_WINDOW_DAYS);
  const [windowRange, setWindowRange] = useState({ start: DEFAULT_WINDOW_DAYS, end: 0 });
  const [scrollToken, setScrollToken] = useState(0);
  const [timeExpanded, setTimeExpanded] = useState(false);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [nameSheetOpen, setNameSheetOpen] = useState(false);
  const [savingSpot, setSavingSpot] = useState(false);
  const [deleteConfirmSpot, setDeleteConfirmSpot] = useState<Spot | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [unclusteredSpotIds, setUnclusteredSpotIds] = useState<Set<number>>(new Set());
  const markerRefs = useRef<Record<number, L.Marker | null>>({});
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const windClusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const spotMarkerRefs = useRef<Record<number, L.Marker | null>>({});

  function refreshSpots() {
    listSpots()
      .then(setSpots)
      .catch(() => {
        /* Spots are a nice-to-have overlay — a failed fetch just means none show. */
      });
  }

  // A wind badge's name label should only show once there's actually room
  // for it — i.e. once the cluster group has spread it out into its own
  // standalone marker rather than folding it into a cluster bubble.
  // Leaflet.markercluster's getVisibleParent(marker) returns the marker
  // itself when it's currently shown standalone, or the cluster bubble
  // representing it otherwise.
  function refreshUnclusteredSpots() {
    const group = windClusterGroupRef.current;
    if (!group) return;
    const next = new Set<number>();
    for (const spot of spots) {
      const marker = spotMarkerRefs.current[spot.id];
      if (!marker) continue;
      const parent = group.getVisibleParent(marker);
      if (!parent || parent === marker) next.add(spot.id);
    }
    setUnclusteredSpotIds(next);
  }

  useEffect(() => {
    const group = windClusterGroupRef.current;
    if (!group) return;
    group.on("animationend", refreshUnclusteredSpots);
    // react-leaflet-cluster buffers addLayer calls via queueMicrotask instead
    // of adding them synchronously on mount (same quirk the catch-marker
    // zoomToShowLayer fix above works around) — queuing this call too lets
    // that pending flush finish first, so getVisibleParent() sees markers
    // that have actually been registered in the cluster's tree.
    queueMicrotask(refreshUnclusteredSpots);
    return () => {
      group.off("animationend", refreshUnclusteredSpots);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, spotsEnabled, drawMode]);

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
    refreshSpots();
  }, []);

  function toggleDrawMode() {
    setDrawMode((v) => !v);
    setDrawPoints([]);
    setDeleteConfirmSpot(null);
  }

  function undoLastPoint() {
    setDrawPoints((pts) => pts.slice(0, -1));
  }

  function finishDrawing() {
    if (drawPoints.length < MIN_SPOT_POINTS) return;
    setNameSheetOpen(true);
  }

  async function saveSpot(name: string) {
    setSavingSpot(true);
    try {
      await createSpot({ name, polygon: drawPoints });
      refreshSpots();
      setNameSheetOpen(false);
      setDrawMode(false);
      setDrawPoints([]);
    } catch {
      /* Leave the sheet open so the admin can retry rather than losing the drawn shape. */
    } finally {
      setSavingSpot(false);
    }
  }

  async function confirmDeleteSpot() {
    if (!deleteConfirmSpot) return;
    try {
      await deleteSpot(deleteConfirmSpot.id);
      refreshSpots();
    } finally {
      setDeleteConfirmSpot(null);
    }
  }

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
      {drawMode ? (
        <div className="map-draw-toolbar">
          {deleteConfirmSpot ? (
            <>
              <span className="map-draw-toolbar-label">Delete "{deleteConfirmSpot.name}"?</span>
              <div className="map-draw-toolbar-actions">
                <button type="button" className="secondary-button" onClick={() => setDeleteConfirmSpot(null)}>
                  Cancel
                </button>
                <button type="button" className="danger-button" onClick={confirmDeleteSpot}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="map-draw-toolbar-label">
                {drawPoints.length < MIN_SPOT_POINTS
                  ? `Tap the map to outline a spot (${drawPoints.length} pt${drawPoints.length === 1 ? "" : "s"})`
                  : "Tap existing spots to delete them"}
              </span>
              <div className="map-draw-toolbar-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={undoLastPoint}
                  disabled={drawPoints.length === 0}
                >
                  Undo
                </button>
                <button type="button" onClick={finishDrawing} disabled={drawPoints.length < MIN_SPOT_POINTS}>
                  Finish
                </button>
                <button type="button" className="danger-button" onClick={toggleDrawMode}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        // Stacked as a single flex column, bottom-anchored, so the time
        // panel and layer toggles shift together as the time panel
        // expands/collapses, instead of both being pinned to independent
        // fixed pixel offsets that drift apart.
        <div className="map-bottom-stack">
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
          <div className="map-layer-toggles">
            <button
              type="button"
              className={`map-layer-toggle${pinsEnabled ? " active" : ""}`}
              onClick={() => setPinsEnabled((v) => !v)}
            >
              🎣 Catches
            </button>
            <button
              type="button"
              className={`map-layer-toggle${heatmapEnabled ? " active" : ""}`}
              onClick={() => setHeatmapEnabled((v) => !v)}
            >
              🔥 Heatmap
            </button>
            <button
              type="button"
              className={`map-layer-toggle${spotsEnabled ? " active" : ""}`}
              onClick={() => setSpotsEnabled((v) => !v)}
            >
              🧭 Spots
            </button>
            {currentUser?.is_admin && (
              <button type="button" className="map-layer-toggle" onClick={toggleDrawMode}>
                ✏️ Edit
              </button>
            )}
          </div>
        </div>
      )}
      <MapContainer
        center={center}
        zoom={focus ? 15 : 11}
        className="map-container"
        zoomControl={false}
        attributionControl={false}
        doubleClickZoom={!drawMode}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          detectRetina
        />
        <MapDragCollapse onDragStart={() => setTimeExpanded(false)} />
        {drawMode && <SpotDrawLayer onAddPoint={(pt) => setDrawPoints((pts) => [...pts, pt])} />}
        {drawMode && drawPoints.length > 0 && (
          <Polygon positions={drawPoints} pathOptions={{ color: "#0f9d8f", weight: 2, dashArray: "6 4" }} interactive={false} />
        )}
        {/* Pins, heatmap, and wind badges are hidden while drawing so every
            tap lands as a polygon vertex instead of hitting a pin or badge
            underneath it. Spot outlines stay visible (and become tappable)
            so the admin can delete an existing one without leaving draw mode. */}
        {!drawMode && heatmapEnabled && <HeatmapLayer points={heatPoints} />}
        {!drawMode &&
          showPins && (
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
        {/* Zone borders stay invisible to regular users — people already know
            these spots, so all they need is the wind reading. Only the admin
            sees the outline, and only while editing (to tap a spot for delete). */}
        {drawMode &&
          spots.map((spot) => (
            <Polygon
              key={spot.id}
              positions={spot.polygon}
              pathOptions={{ color: "#0f9d8f", weight: 1.5, fillOpacity: 0.08 }}
              interactive
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  setDeleteConfirmSpot(spot);
                },
              }}
            />
          ))}
        {!drawMode && spotsEnabled && <WindClusterZoomSync onZoomEnd={refreshUnclusteredSpots} />}
        {!drawMode && spotsEnabled && (
          <MarkerClusterGroup
            ref={windClusterGroupRef}
            showCoverageOnHover={false}
            maxClusterRadius={50}
            iconCreateFunction={createWindClusterIcon}
          >
            {spots.map((spot) => (
              <WindBadge
                key={spot.id}
                spot={spot}
                showLabel={unclusteredSpotIds.has(spot.id)}
                onSelect={setSelectedSpot}
                onWindLoaded={() => windClusterGroupRef.current?.refreshClusters()}
                markerRef={(instance) => {
                  spotMarkerRefs.current[spot.id] = instance;
                }}
              />
            ))}
          </MarkerClusterGroup>
        )}
        {myLocation && (
          <Marker position={[myLocation.lat, myLocation.lng]} icon={currentLocationIcon} interactive={false} />
        )}
      </MapContainer>
      <SpotNameSheet
        open={nameSheetOpen}
        saving={savingSpot}
        onCancel={() => setNameSheetOpen(false)}
        onSave={saveSpot}
      />
      <WindDetailSheet
        spot={selectedSpot}
        catches={catches}
        open={selectedSpot != null}
        onClose={() => setSelectedSpot(null)}
      />
    </div>
  );
}

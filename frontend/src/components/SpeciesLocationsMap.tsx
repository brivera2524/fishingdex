import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { catchMarkerIcon, createClusterIcon, SAN_DIEGO } from "../leafletSetup";
import { API_BASE } from "../api/client";
import type { MapCatch } from "../api/types";

function FitToMarkers({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 11);
    } else {
      map.fitBounds(points, { padding: [28, 28] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, map]);
  return null;
}

interface SpeciesLocationsMapProps {
  catches: MapCatch[];
}

export default function SpeciesLocationsMap({ catches }: SpeciesLocationsMapProps) {
  if (catches.length === 0) return null;

  const points: [number, number][] = catches.map((c) => [c.latitude, c.longitude]);

  return (
    <div className="species-mini-map">
      <p className="section-label">Where it's been caught</p>
      <MapContainer center={points[0] ?? SAN_DIEGO} zoom={10} className="species-mini-map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          detectRetina
        />
        <FitToMarkers points={points} />
        <MarkerClusterGroup
          showCoverageOnHover={false}
          maxClusterRadius={20}
          iconCreateFunction={createClusterIcon}
          removeOutsideVisibleBounds={false}
        >
          {catches.map((c) => (
            <Marker key={c.id} position={[c.latitude, c.longitude]} icon={catchMarkerIcon}>
              <Popup>
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

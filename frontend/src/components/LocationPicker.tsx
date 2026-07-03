import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { catchMarkerIcon, SAN_DIEGO } from "../leafletSetup";

export interface LatLng {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  value: LatLng | null;
  onChange: (coords: LatLng) => void;
  /** False renders a flat, non-interactive preview (no pan/zoom/tap-to-set) — used for the collapsed preview that opens into the full picker. */
  interactive?: boolean;
}

function ClickHandler({ onChange }: { onChange: (coords: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// The map instance stays mounted across location-mode switches (current /
// manual / photo) so it reads as "the same map, different pin" rather than
// swapping map widgets — this recenters it whenever the active coords change
// (geolocation resolving, EXIF resolving, mode switch, or a manual pin drop).
function RecenterOnChange({ value }: { value: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], 13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);
  return null;
}

export default function LocationPicker({ value, onChange, interactive = true }: LocationPickerProps) {
  return (
    <div className="location-picker">
      <MapContainer
        center={SAN_DIEGO}
        zoom={10}
        className="location-picker-map"
        dragging={interactive}
        touchZoom={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        zoomControl={interactive}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          detectRetina
        />
        {interactive && <ClickHandler onChange={onChange} />}
        <RecenterOnChange value={value} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={catchMarkerIcon}
            draggable={interactive}
            eventHandlers={
              interactive
                ? {
                    dragend: (e) => {
                      const pos = e.target.getLatLng();
                      onChange({ lat: pos.lat, lng: pos.lng });
                    },
                  }
                : undefined
            }
          />
        )}
      </MapContainer>
      {interactive && (
        <p className="card-meta">
          Tap the map to set the catch location{value ? " — drag the pin to adjust" : ""}.
        </p>
      )}
    </div>
  );
}

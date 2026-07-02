import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { SAN_DIEGO } from "../leafletSetup";

export interface LatLng {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  value: LatLng | null;
  onChange: (coords: LatLng) => void;
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

export default function LocationPicker({ value, onChange }: LocationPickerProps) {
  return (
    <div className="location-picker">
      <MapContainer center={SAN_DIEGO} zoom={10} className="location-picker-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onChange={onChange} />
        <RecenterOnChange value={value} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const pos = e.target.getLatLng();
                onChange({ lat: pos.lat, lng: pos.lng });
              },
            }}
          />
        )}
      </MapContainer>
      <p className="card-meta">
        Tap the map to set the catch location{value ? " — drag the pin to adjust" : ""}.
      </p>
    </div>
  );
}

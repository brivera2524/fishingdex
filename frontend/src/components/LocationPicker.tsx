import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { SAN_DIEGO } from "../leafletSetup";

export interface LatLng {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  value: LatLng | null;
  onChange: (coords: LatLng) => void;
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

export default function LocationPicker({ value, onChange, interactive = true }: LocationPickerProps) {
  const center: [number, number] = value ? [value.lat, value.lng] : SAN_DIEGO;

  return (
    <div className="location-picker">
      <MapContainer center={center} zoom={value ? 13 : 10} className="location-picker-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {interactive && <ClickHandler onChange={onChange} />}
        {value && (
          <Marker
            position={[value.lat, value.lng]}
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

import { createPortal } from "react-dom";
import LocationPicker, { type LatLng } from "./LocationPicker";

interface LocationPickerModalProps {
  value: LatLng | null;
  onChange: (coords: LatLng) => void;
  onDone: () => void;
}

export default function LocationPickerModal({ value, onChange, onDone }: LocationPickerModalProps) {
  // Portalled to the body for the same reason as PhotoCropModal/
  // DiscoveryReveal: opened from inside a BottomSheet, whose motion.div
  // always has an inline transform applied, which would otherwise confine
  // this `position: fixed` overlay to the sheet's box instead of the
  // viewport.
  return createPortal(
    <div className="location-picker-overlay">
      <div className="location-picker-modal-stage">
        <LocationPicker value={value} onChange={onChange} />
      </div>
      <div className="location-picker-modal-actions">
        <button type="button" onClick={onDone}>
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}

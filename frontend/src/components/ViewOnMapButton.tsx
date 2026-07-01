import { useNavigate } from "react-router-dom";

interface ViewOnMapButtonProps {
  catchId: number;
  latitude: number | null;
  longitude: number | null;
}

export default function ViewOnMapButton({ catchId, latitude, longitude }: ViewOnMapButtonProps) {
  const navigate = useNavigate();

  if (latitude == null || longitude == null) return null;

  return (
    <button
      type="button"
      className="secondary-button"
      onClick={() => navigate("/map", { state: { focusCatchId: catchId, latitude, longitude } })}
    >
      📍 View on map
    </button>
  );
}

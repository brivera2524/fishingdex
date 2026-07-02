import { useEffect, useState, type FormEvent } from "react";
import { gps as parseExifGps, parse as parseExif } from "exifr";
import {
  createCatch,
  deleteCatchPhoto,
  getCatch,
  listMyCatches,
  listSpecies,
  updateCatch,
  uploadCatchPhoto,
} from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { Species } from "../api/types";
import DiscoveryReveal from "../components/DiscoveryReveal";
import LocationPicker, { type LatLng } from "../components/LocationPicker";
import LocationPickerModal from "../components/LocationPickerModal";
import PhotoCropModal from "../components/PhotoCropModal";

type LocationMode = "current" | "manual" | "photo";
type PhotoExif = { coords: LatLng | null; caughtAt: Date | null };

function splitLocalDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

async function readPhotoExif(file: File): Promise<PhotoExif> {
  // These need separate calls: exifr's `pick` option filters every enabled
  // segment down to just the picked tag names, so combining `pick:
  // ["DateTimeOriginal"]` with `gps: true` in one parse() silently drops the
  // GPS tags before they're merged into latitude/longitude. exifr.gps() uses
  // its own dedicated, correct fast path for just the coordinates.
  const [gpsResult, timeResult] = await Promise.allSettled([
    parseExifGps(file),
    parseExif(file, { pick: ["DateTimeOriginal"] }),
  ]);
  const gpsValue = gpsResult.status === "fulfilled" ? gpsResult.value : null;
  const timeValue = timeResult.status === "fulfilled" ? timeResult.value : null;
  return {
    coords:
      gpsValue && typeof gpsValue.latitude === "number" && typeof gpsValue.longitude === "number"
        ? { lat: gpsValue.latitude, lng: gpsValue.longitude }
        : null,
    caughtAt: timeValue?.DateTimeOriginal instanceof Date ? timeValue.DateTimeOriginal : null,
  };
}

export interface DetectState {
  speciesId: number | null;
  photoBlob: Blob;
  /** True when the camera flow already showed the discovery reveal at confirm time. */
  alreadyRevealed?: boolean;
}

interface CatchFormProps {
  /** Present when editing an existing catch; absent when logging a new one. */
  catchId?: number;
  /** Carried over from the camera-identify flow, if that's how we got here. */
  detectState?: DetectState | null;
  /** Called once the catch has been saved (or the discovery reveal dismissed). */
  onDone: () => void;
}

export default function CatchForm({ catchId, detectState = null, onDone }: CatchFormProps) {
  const isEdit = catchId != null;

  const [species, setSpecies] = useState<Species[]>([]);
  const [speciesId, setSpeciesId] = useState<number | "">("");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [notes, setNotes] = useState("");
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCatch, setLoadingCatch] = useState(isEdit);
  const [priorSpeciesIds, setPriorSpeciesIds] = useState<Set<number> | null>(null);
  const [discovery, setDiscovery] = useState<{ species: Species; photoUrl: string | null } | null>(null);
  const [coords, setCoords] = useState<LatLng | null>(null);
  // Manual entry only: the camera-identify flow (detectState present) always
  // uses current location + now since both are guaranteed accurate there.
  // Default is "manual" (no pin) until a photo's EXIF GPS resolves it to
  // "photo" — see the effect below.
  const [locationMode, setLocationMode] = useState<LocationMode>("manual");
  const [manualCoords, setManualCoords] = useState<LatLng | null>(null);
  const [photoCoords, setPhotoCoords] = useState<LatLng | null>(null);
  const [photoExifStatus, setPhotoExifStatus] = useState<"idle" | "loading" | "found" | "not-found">("idle");
  const initialDateTime = splitLocalDateTime(new Date());
  const [caughtDate, setCaughtDate] = useState(initialDateTime.date);
  const [caughtTime, setCaughtTime] = useState(initialDateTime.time);
  const [pendingCrop, setPendingCrop] = useState<{ objectUrl: string; exifPromise: Promise<PhotoExif> } | null>(
    null
  );
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  useEffect(() => {
    if (isEdit || !navigator.geolocation) return;
    if (!detectState && locationMode !== "current") return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* Location unavailable or denied — catch still saves without it. */
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, locationMode]);

  useEffect(() => {
    if (isEdit || detectState || photoFile) return;
    setPhotoCoords(null);
    setPhotoExifStatus("idle");
    setLocationMode((prev) => (prev === "photo" ? "manual" : prev));
  }, [photoFile, isEdit, detectState]);

  useEffect(() => {
    listSpecies()
      .then((list) => {
        setSpecies(list);
        if (!isEdit) {
          const preselect = detectState?.speciesId ?? list[0]?.id;
          if (preselect != null) setSpeciesId(preselect);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load species"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  useEffect(() => {
    if (isEdit) return;
    listMyCatches()
      .then((catches) => setPriorSpeciesIds(new Set(catches.map((c) => c.species_id))))
      .catch(() => setPriorSpeciesIds(new Set()));
  }, [isEdit]);

  useEffect(() => {
    if (!detectState?.photoBlob || isEdit) return;
    setPhotoFile(new File([detectState.photoBlob], "capture.jpg", { type: detectState.photoBlob.type }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (catchId == null) return;
    getCatch(catchId)
      .then((c) => {
        setSpeciesId(c.species_id);
        setWeight(c.weight != null ? String(c.weight) : "");
        setLength(c.length != null ? String(c.length) : "");
        setNotes(c.notes ?? "");
        setExistingPhotoUrl(c.photo_url);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load catch"))
      .finally(() => setLoadingCatch(false));
  }, [catchId]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    // Reset the input so re-selecting the same file (e.g. after cancelling
    // the crop) fires another change event.
    e.target.value = "";
    if (!file) return;
    // Read EXIF from the original file now — cropping re-encodes through a
    // canvas, which strips all metadata, so this has to happen before that.
    const exifPromise = !isEdit && !detectState ? readPhotoExif(file) : Promise.resolve({ coords: null, caughtAt: null });
    setPendingCrop({ objectUrl: URL.createObjectURL(file), exifPromise });
  }

  function handleCropCancel() {
    if (!pendingCrop) return;
    URL.revokeObjectURL(pendingCrop.objectUrl);
    setPendingCrop(null);
  }

  async function handleCropConfirm(blob: Blob) {
    if (!pendingCrop) return;
    const croppedFile = new File([blob], "catch.jpg", { type: "image/jpeg" });
    setPhotoFile(croppedFile);
    setRemovePhoto(false);

    if (!isEdit && !detectState) {
      setLocationMode("photo");
      setPhotoExifStatus("loading");
      const exifResult = await pendingCrop.exifPromise;
      if (exifResult.coords) {
        setPhotoCoords(exifResult.coords);
        setPhotoExifStatus("found");
        setLocationMode("photo");
      } else {
        setPhotoCoords(null);
        setPhotoExifStatus("not-found");
        setLocationMode((prev) => (prev === "photo" ? "manual" : prev));
      }
      if (exifResult.caughtAt) {
        const split = splitLocalDateTime(exifResult.caughtAt);
        setCaughtDate(split.date);
        setCaughtTime(split.time);
      }
    }

    URL.revokeObjectURL(pendingCrop.objectUrl);
    setPendingCrop(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (speciesId === "") return;
    setError(null);
    setLoading(true);
    try {
      let savedCatchId: number;
      const isNewSpecies =
        !isEdit &&
        !detectState?.alreadyRevealed &&
        priorSpeciesIds != null &&
        !priorSpeciesIds.has(speciesId);

      if (isEdit && catchId != null) {
        savedCatchId = catchId;
        await updateCatch(savedCatchId, {
          species_id: speciesId,
          weight: weight ? Number(weight) : null,
          length: length ? Number(length) : null,
          notes: notes || null,
        });
      } else {
        const effectiveCoords = detectState
          ? coords
          : locationMode === "current"
            ? coords
            : locationMode === "manual"
              ? manualCoords
              : photoCoords;
        const effectiveCaughtAt = detectState ? new Date() : new Date(`${caughtDate}T${caughtTime}`);

        const created = await createCatch({
          species_id: speciesId,
          weight: weight ? Number(weight) : null,
          length: length ? Number(length) : null,
          caught_at: effectiveCaughtAt.toISOString(),
          notes: notes || null,
          latitude: effectiveCoords?.lat ?? null,
          longitude: effectiveCoords?.lng ?? null,
        });
        savedCatchId = created.id;
      }

      let savedPhotoUrl: string | null = existingPhotoUrl;
      if (photoFile) {
        const updated = await uploadCatchPhoto(savedCatchId, photoFile);
        savedPhotoUrl = updated.photo_url;
      } else if (isEdit && removePhoto && existingPhotoUrl) {
        await deleteCatchPhoto(savedCatchId);
        savedPhotoUrl = null;
      }

      if (isNewSpecies) {
        const matchedSpecies = species.find((s) => s.id === speciesId);
        if (matchedSpecies) {
          setDiscovery({ species: matchedSpecies, photoUrl: savedPhotoUrl });
          return;
        }
      }

      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save catch");
    } finally {
      setLoading(false);
    }
  }

  const previewUrl = photoFile
    ? URL.createObjectURL(photoFile)
    : existingPhotoUrl && !removePhoto
      ? `${API_BASE}${existingPhotoUrl}`
      : null;

  const activeCoords = locationMode === "current" ? coords : locationMode === "manual" ? manualCoords : photoCoords;
  function setManualPin(next: LatLng) {
    setLocationMode("manual");
    setManualCoords(next);
  }

  if (discovery) {
    return (
      <DiscoveryReveal
        species={discovery.species}
        photoSrc={discovery.photoUrl ? `${API_BASE}${discovery.photoUrl}` : null}
        onDone={onDone}
      />
    );
  }

  if (loadingCatch) {
    return <p>Loading...</p>;
  }

  return (
    <>
      <h1>{isEdit ? "Edit catch" : "Log a catch"}</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Species
          <select
            value={speciesId}
            onChange={(e) => setSpeciesId(Number(e.target.value))}
            required
          >
            {species.map((s) => (
              <option key={s.id} value={s.id}>
                {s.common_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Weight (lb)
          <input type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label>
          Length (in)
          <input type="number" step="0.01" value={length} onChange={(e) => setLength(e.target.value)} />
        </label>
        <label>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label>
          Photo
          <div className="photo-upload-field">
            <div className="photo-upload-button">
              <span className="photo-upload-icon">📷</span>
              {previewUrl ? "Change photo" : "Add a photo"}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="photo-upload-input"
              aria-label="Photo"
            />
          </div>
        </label>
        {previewUrl && (
          <div className="photo-preview">
            <img src={previewUrl} alt="Catch preview" />
            {isEdit && existingPhotoUrl && !photoFile && (
              <button
                type="button"
                className="link-button"
                onClick={() => setRemovePhoto(true)}
              >
                Remove photo
              </button>
            )}
          </div>
        )}
        {!isEdit && !detectState && (
          <>
            <label>
              Date caught
              <input type="date" value={caughtDate} onChange={(e) => setCaughtDate(e.target.value)} required />
            </label>
            <label>
              Time caught
              <input type="time" value={caughtTime} onChange={(e) => setCaughtTime(e.target.value)} required />
            </label>
            <div>
              <p className="section-label" style={{ margin: "0 0 8px" }}>
                Location
              </p>
              <div className="mode-pill-toggle">
                <button
                  type="button"
                  className={locationMode === "current" ? "active" : ""}
                  onClick={() => setLocationMode("current")}
                >
                  📍 Current
                </button>
                <button
                  type="button"
                  className={locationMode === "manual" ? "active" : ""}
                  onClick={() => setLocationMode("manual")}
                >
                  🗺️ Manual
                </button>
                <button
                  type="button"
                  className={locationMode === "photo" ? "active" : ""}
                  disabled={!photoFile}
                  onClick={() => setLocationMode("photo")}
                >
                  🖼️ Photo
                </button>
              </div>

              {locationMode === "current" && (
                <p className="card-meta" style={{ marginTop: 8 }}>
                  {coords ? "📍 Location attached" : "Detecting location..."}
                </p>
              )}
              {locationMode === "photo" && photoExifStatus === "loading" && (
                <p className="card-meta" style={{ marginTop: 8 }}>
                  Reading photo location...
                </p>
              )}
              {locationMode === "photo" && photoExifStatus === "not-found" && (
                <p className="error" style={{ marginTop: 8 }}>
                  No location found in this photo's metadata. Try current location or drop a pin below.
                </p>
              )}
              <div
                className="location-preview"
                role="button"
                tabIndex={0}
                onClick={() => setLocationModalOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setLocationModalOpen(true);
                }}
              >
                <LocationPicker value={activeCoords} onChange={setManualPin} interactive={false} />
                <span className="location-preview-hint">Tap to adjust</span>
              </div>
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading || species.length === 0}>
          {loading ? "Saving..." : isEdit ? "Save changes" : "Save catch"}
        </button>
      </form>
      {pendingCrop && (
        <PhotoCropModal imageSrc={pendingCrop.objectUrl} onCancel={handleCropCancel} onConfirm={handleCropConfirm} />
      )}
      {locationModalOpen && (
        <LocationPickerModal
          value={activeCoords}
          onChange={setManualPin}
          onDone={() => setLocationModalOpen(false)}
        />
      )}
    </>
  );
}

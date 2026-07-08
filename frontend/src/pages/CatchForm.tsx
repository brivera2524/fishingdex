import { useEffect, useState, type FormEvent } from "react";
import { gps as parseExifGps, parse as parseExif } from "exifr";
import {
  addCatchPhoto,
  createCatch,
  createSpecies,
  deleteCatchPhoto,
  getCatch,
  getChallenges,
  identifyPhoto,
  listMyCatches,
  listSpecies,
  updateCatch,
} from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { CatchPhoto, Challenge, Species } from "../api/types";
import AddSpeciesSheet from "../components/AddSpeciesSheet";
import type { CelebrationDetails } from "../components/CatchCelebration";
import DiscoveryReveal from "../components/DiscoveryReveal";
import LocationPicker, { type LatLng } from "../components/LocationPicker";
import LocationPickerModal from "../components/LocationPickerModal";
import PhotoCropModal from "../components/PhotoCropModal";

const ADD_SPECIES_OPTION = "__add_species__";

type LocationMode = "current" | "manual" | "photo";
type PhotoExif = { coords: LatLng | null; caughtAt: Date | null };
type StagedPhoto = { file: File; previewUrl: string };
type DisplayPhoto =
  | { kind: "existing"; id: number; url: string }
  | { kind: "staged"; stagedIndex: number; url: string; file: File };

const MAX_PHOTOS = 4;
// Must match SPECIES_GROUPS[-1] in backend/app/routers/leaderboard.py — no
// dedicated endpoint exposes this grouping today, so it's kept in sync by hand.
const BIG_THREE_SPECIES = ["Spotted Bay Bass", "Barred Sand Bass", "Calico Bass"];

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
  /** Called once the catch has been saved (or the discovery reveal dismissed).
   * `celebration` carries which animation (if any) the caller should play —
   * omitted when a new-species DiscoveryReveal was shown instead, to keep
   * the two celebratory moments from stacking. `catchId` is the just-saved
   * catch, so the caller can jump straight to it in My Catches. */
  onDone: (celebration?: CelebrationDetails, catchId?: number) => void;
}

export default function CatchForm({ catchId, detectState = null, onDone }: CatchFormProps) {
  const isEdit = catchId != null;

  const [species, setSpecies] = useState<Species[]>([]);
  const [speciesId, setSpeciesId] = useState<number | "">("");
  const [addSpeciesOpen, setAddSpeciesOpen] = useState(false);
  const [addSpeciesSaving, setAddSpeciesSaving] = useState(false);
  const [addSpeciesError, setAddSpeciesError] = useState<string | null>(null);
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [notes, setNotes] = useState("");
  const [existingPhotos, setExistingPhotos] = useState<CatchPhoto[]>([]);
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<Set<number>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCatch, setLoadingCatch] = useState(isEdit);
  const [priorSpeciesIds, setPriorSpeciesIds] = useState<Set<number> | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [discovery, setDiscovery] = useState<{ species: Species; photoUrl: string | null; catchId: number } | null>(
    null
  );
  const [coords, setCoords] = useState<LatLng | null>(null);
  // Manual entry only: the camera-identify flow (detectState present) always
  // uses current location + now since both are guaranteed accurate there.
  // Default is "manual" (no pin) until photo EXIF or geolocation resolves —
  // see the priority effect below, which defaults photo > current > manual
  // depending on what's available, unless the user has picked a mode
  // themselves (userPickedLocationMode), in which case their choice sticks.
  const [locationMode, setLocationMode] = useState<LocationMode>("manual");
  const [userPickedLocationMode, setUserPickedLocationMode] = useState(false);
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
  const [identifying, setIdentifying] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);

  useEffect(() => {
    if (isEdit || !navigator.geolocation) return;
    // Fetched proactively (not just when the user picks "Current") since
    // it's also the fallback default when a photo has no location — see the
    // priority effect below.
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* Location unavailable or denied — catch still saves without it. */
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }, [isEdit]);

  // Defaults the location mode to whatever's available, in priority order:
  // photo EXIF > current location > manual (blank). Re-evaluates as each
  // becomes available, but never overrides a mode the user picked themselves.
  useEffect(() => {
    if (isEdit || detectState || userPickedLocationMode) return;
    if (photoExifStatus === "found") {
      setLocationMode("photo");
    } else if (photoExifStatus !== "loading" && coords) {
      setLocationMode("current");
    } else if (photoExifStatus === "not-found" && !coords) {
      setLocationMode("manual");
    }
  }, [photoExifStatus, coords, isEdit, detectState, userPickedLocationMode]);

  useEffect(() => {
    listSpecies()
      .then((list) => {
        setSpecies(list);
        // Only the camera-identify flow comes with a confirmed species —
        // manual entry starts blank (no more defaulting to whatever's first
        // alphabetically) until the user picks one or auto-detect resolves.
        if (!isEdit && detectState?.speciesId != null) {
          setSpeciesId(detectState.speciesId);
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

  // Drives the Big Three "bring a weight photo" reminder — only shown while
  // a challenge covering that species group is actually running.
  useEffect(() => {
    getChallenges()
      .then(setChallenges)
      .catch(() => setChallenges([]));
  }, []);

  useEffect(() => {
    if (!detectState?.photoBlob || isEdit) return;
    const file = new File([detectState.photoBlob], "capture.jpg", { type: detectState.photoBlob.type });
    setStagedPhotos([{ file, previewUrl: URL.createObjectURL(file) }]);
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
        setExistingPhotos(c.photos);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load catch"))
      .finally(() => setLoadingCatch(false));
  }, [catchId]);

  const visibleExisting = existingPhotos.filter((p) => !removedPhotoIds.has(p.id));
  const combinedPhotos: DisplayPhoto[] = [
    ...visibleExisting.map((p): DisplayPhoto => ({ kind: "existing", id: p.id, url: `${API_BASE}${p.photo_url}` })),
    ...stagedPhotos.map((p, i): DisplayPhoto => ({ kind: "staged", stagedIndex: i, url: p.previewUrl, file: p.file })),
  ];
  const clampedSelectedIndex = Math.min(selectedIndex, Math.max(combinedPhotos.length - 1, 0));

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    // Reset the input so re-selecting the same file (e.g. after cancelling
    // the crop) fires another change event.
    e.target.value = "";
    if (!file) return;
    if (combinedPhotos.length >= MAX_PHOTOS) return;
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
    const isFirstPhoto = combinedPhotos.length === 0;
    const croppedFile = new File([blob], "catch.jpg", { type: "image/jpeg" });
    const newStagedIndex = stagedPhotos.length;
    setStagedPhotos((prev) => [...prev, { file: croppedFile, previewUrl: URL.createObjectURL(croppedFile) }]);
    setSelectedIndex(visibleExisting.length + newStagedIndex);

    // Only the very first photo added to the catch defaults location/time —
    // adding a 2nd/3rd/4th photo shouldn't override what's already been set.
    if (!isEdit && !detectState && isFirstPhoto) {
      // Optimistically shows the "reading..." state under the photo pill
      // immediately, but only if the user hasn't already picked a mode
      // themselves — the priority effect takes it from here once the EXIF
      // read resolves.
      if (!userPickedLocationMode) setLocationMode("photo");
      setPhotoExifStatus("loading");

      const exifResult = await pendingCrop.exifPromise;
      setPhotoCoords(exifResult.coords);
      setPhotoExifStatus(exifResult.coords ? "found" : "not-found");
      if (exifResult.caughtAt) {
        const split = splitLocalDateTime(exifResult.caughtAt);
        setCaughtDate(split.date);
        setCaughtTime(split.time);
      }
    }

    URL.revokeObjectURL(pendingCrop.objectUrl);
    setPendingCrop(null);
  }

  function removePhotoAt(displayIndex: number) {
    const target = combinedPhotos[displayIndex];
    if (!target) return;
    if (target.kind === "existing") {
      setRemovedPhotoIds((prev) => new Set(prev).add(target.id));
    } else {
      setStagedPhotos((prev) => prev.filter((_, i) => i !== target.stagedIndex));
    }
    setSelectedIndex(0);
  }

  async function handleIdentify() {
    const target = combinedPhotos[clampedSelectedIndex];
    if (!target) return;
    setIdentifying(true);
    setAutoDetected(false);
    try {
      // Staged photos already have a File on hand; an already-uploaded photo
      // only has a URL client-side, so it has to be re-fetched as a blob.
      const blob = target.kind === "staged" ? target.file : await fetch(target.url).then((r) => r.blob());
      const result = await identifyPhoto(blob);
      if (result.species) {
        setSpeciesId(result.species.id);
        setAutoDetected(true);
      }
    } catch {
      /* Best-effort — the user can still pick a species manually. */
    } finally {
      setIdentifying(false);
    }
  }

  async function handleAddSpecies(commonName: string, scientificName: string) {
    setAddSpeciesSaving(true);
    setAddSpeciesError(null);
    try {
      const created = await createSpecies({
        common_name: commonName,
        scientific_name: scientificName || null,
      });
      setSpecies((prev) => [...prev, created].sort((a, b) => a.common_name.localeCompare(b.common_name)));
      setSpeciesId(created.id);
      setAutoDetected(false);
      setAddSpeciesOpen(false);
    } catch (err) {
      setAddSpeciesError(err instanceof ApiError ? err.message : "Failed to add species");
    } finally {
      setAddSpeciesSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (speciesId === "") return;
    setError(null);
    setLoading(true);
    try {
      let savedCatchId: number;
      // Editing an existing catch only celebrates if it's now a PB/record —
      // re-saving notes on an old catch shouldn't replay "you caught a
      // fish!". A brand-new catch always celebrates, at least at the basic
      // tier, since logging any catch is the moment worth marking.
      let celebration: CelebrationDetails | undefined;
      const isNewSpecies =
        !isEdit &&
        !detectState?.alreadyRevealed &&
        priorSpeciesIds != null &&
        !priorSpeciesIds.has(speciesId);

      if (isEdit && catchId != null) {
        savedCatchId = catchId;
        const updated = await updateCatch(savedCatchId, {
          species_id: speciesId,
          weight: weight ? Number(weight) : null,
          length: length ? Number(length) : null,
          notes: notes || null,
        });
        const tier = updated.is_leaderboard_record ? "record" : updated.is_personal_best ? "pb" : null;
        if (tier) {
          celebration = {
            tier,
            speciesName: updated.species.common_name,
            weight: updated.weight,
            previousWeight: updated.previous_best_weight,
          };
        }
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
        celebration = {
          tier: created.is_leaderboard_record ? "record" : created.is_personal_best ? "pb" : "catch",
          speciesName: created.species.common_name,
          weight: created.weight,
          previousWeight: created.previous_best_weight,
        };
      }

      for (const photoId of removedPhotoIds) {
        await deleteCatchPhoto(savedCatchId, photoId);
      }
      for (const staged of stagedPhotos) {
        await addCatchPhoto(savedCatchId, staged.file);
      }
      const savedPhotoUrl = combinedPhotos[0]?.url ?? null;

      if (isNewSpecies) {
        const matchedSpecies = species.find((s) => s.id === speciesId);
        if (matchedSpecies) {
          setDiscovery({ species: matchedSpecies, photoUrl: savedPhotoUrl, catchId: savedCatchId });
          return;
        }
      }

      onDone(celebration, savedCatchId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save catch");
    } finally {
      setLoading(false);
    }
  }

  const activeCoords = locationMode === "current" ? coords : locationMode === "manual" ? manualCoords : photoCoords;
  function pickLocationMode(mode: LocationMode) {
    setUserPickedLocationMode(true);
    setLocationMode(mode);
  }
  function setManualPin(next: LatLng) {
    setUserPickedLocationMode(true);
    setLocationMode("manual");
    setManualCoords(next);
  }

  const selectedSpeciesName = species.find((s) => s.id === speciesId)?.common_name;
  const bigThreeChallengeActive = challenges.some((c) => c.status === "active");
  const showBigThreeReminder =
    bigThreeChallengeActive && selectedSpeciesName != null && BIG_THREE_SPECIES.includes(selectedSpeciesName);

  if (discovery) {
    return (
      <DiscoveryReveal
        species={discovery.species}
        photoSrc={discovery.photoUrl}
        onDone={() => onDone(undefined, discovery.catchId)}
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
            onChange={(e) => {
              if (e.target.value === ADD_SPECIES_OPTION) {
                setAddSpeciesError(null);
                setAddSpeciesOpen(true);
                return;
              }
              setSpeciesId(Number(e.target.value));
              setAutoDetected(false);
            }}
            required
          >
            <option value="" disabled>
              Select a species
            </option>
            {species.map((s) => (
              <option key={s.id} value={s.id}>
                {s.common_name}
              </option>
            ))}
            <option value={ADD_SPECIES_OPTION}>+ Add a new species...</option>
          </select>
          {identifying && <p className="card-meta">🔍 Identifying species from photo...</p>}
          {autoDetected && !identifying && (
            <p className="card-meta">✨ Auto-detected from your photo — double check it's correct.</p>
          )}
          {showBigThreeReminder && (
            <p className="reminder-banner">
              📸 The Big Three Challenge is live — include a clear photo of the fish on a scale, or this catch won't
              count!
            </p>
          )}
        </label>
        <div className="form-row">
          <label>
            Weight
            <div className="input-suffix-field">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="Not recorded"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <span className="input-suffix">lb</span>
            </div>
          </label>
          <label>
            Length
            <div className="input-suffix-field">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="Not recorded"
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
              <span className="input-suffix">in</span>
            </div>
          </label>
        </div>
        <label>
          Photos
          <div className="photo-thumb-row">
            {combinedPhotos.map((photo, i) => (
              <div
                key={photo.kind === "existing" ? `existing-${photo.id}` : `staged-${photo.stagedIndex}`}
                className={`photo-thumb-tile${i === clampedSelectedIndex ? " selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedIndex(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedIndex(i);
                }}
              >
                <img src={photo.url} alt="" />
                <button
                  type="button"
                  className="photo-thumb-remove"
                  aria-label="Remove photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePhotoAt(i);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {combinedPhotos.length < MAX_PHOTOS && (
              <label className="photo-thumb-tile photo-thumb-add">
                <span className="photo-upload-icon">📷</span>
                <input type="file" accept="image/*" onChange={handlePhotoChange} aria-label="Add photo" />
              </label>
            )}
          </div>
          {combinedPhotos.length > 0 && !detectState && (
            <button
              type="button"
              className="secondary-button"
              style={{ marginTop: 8 }}
              onClick={handleIdentify}
              disabled={identifying}
            >
              {identifying ? "🔍 Identifying..." : "🔍 Identify species from selected photo"}
            </button>
          )}
        </label>
        {!isEdit && !detectState && (
          <>
            <div className="form-row-auto">
              <label>
                Date caught
                <input type="date" value={caughtDate} onChange={(e) => setCaughtDate(e.target.value)} required />
              </label>
              <label>
                Time caught
                <input type="time" value={caughtTime} onChange={(e) => setCaughtTime(e.target.value)} required />
              </label>
            </div>
            <div>
              <p className="section-label" style={{ margin: "0 0 8px" }}>
                Location
              </p>
              <div className="mode-pill-toggle">
                <button
                  type="button"
                  className={locationMode === "photo" ? "active" : ""}
                  disabled={combinedPhotos.length === 0}
                  onClick={() => pickLocationMode("photo")}
                >
                  🖼️ Photo
                </button>
                <button
                  type="button"
                  className={locationMode === "current" ? "active" : ""}
                  onClick={() => pickLocationMode("current")}
                >
                  📍 Current
                </button>
                <button
                  type="button"
                  className={locationMode === "manual" ? "active" : ""}
                  onClick={() => pickLocationMode("manual")}
                >
                  🗺️ Manual
                </button>
              </div>

              {locationMode === "current" && !coords && (
                <p className="card-meta" style={{ marginTop: 8 }}>
                  Detecting location...
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
        <label>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
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
      <AddSpeciesSheet
        open={addSpeciesOpen}
        saving={addSpeciesSaving}
        error={addSpeciesError}
        onCancel={() => setAddSpeciesOpen(false)}
        onSave={handleAddSpecies}
      />
    </>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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

interface DetectState {
  speciesId: number | null;
  photoBlob: Blob;
  /** True when the camera flow already showed the discovery reveal at confirm time. */
  alreadyRevealed?: boolean;
}

export default function CatchForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const location = useLocation();
  const detectState = location.state as DetectState | null;

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
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isEdit || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* Location unavailable or denied — catch still saves without it. */
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }, [isEdit]);

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
    if (!id) return;
    getCatch(Number(id))
      .then((c) => {
        setSpeciesId(c.species_id);
        setWeight(c.weight != null ? String(c.weight) : "");
        setLength(c.length != null ? String(c.length) : "");
        setNotes(c.notes ?? "");
        setExistingPhotoUrl(c.photo_url);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load catch"))
      .finally(() => setLoadingCatch(false));
  }, [id]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (file) setRemovePhoto(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (speciesId === "") return;
    setError(null);
    setLoading(true);
    try {
      let catchId: number;
      const isNewSpecies =
        !isEdit &&
        !detectState?.alreadyRevealed &&
        priorSpeciesIds != null &&
        !priorSpeciesIds.has(speciesId);

      if (isEdit) {
        catchId = Number(id);
        await updateCatch(catchId, {
          species_id: speciesId,
          weight: weight ? Number(weight) : null,
          length: length ? Number(length) : null,
          notes: notes || null,
        });
      } else {
        const created = await createCatch({
          species_id: speciesId,
          weight: weight ? Number(weight) : null,
          length: length ? Number(length) : null,
          caught_at: new Date().toISOString(),
          notes: notes || null,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        });
        catchId = created.id;
      }

      let savedPhotoUrl: string | null = existingPhotoUrl;
      if (photoFile) {
        const updated = await uploadCatchPhoto(catchId, photoFile);
        savedPhotoUrl = updated.photo_url;
      } else if (isEdit && removePhoto && existingPhotoUrl) {
        await deleteCatchPhoto(catchId);
        savedPhotoUrl = null;
      }

      if (isNewSpecies) {
        const matchedSpecies = species.find((s) => s.id === speciesId);
        if (matchedSpecies) {
          setDiscovery({ species: matchedSpecies, photoUrl: savedPhotoUrl });
          return;
        }
      }

      navigate("/catches");
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

  if (discovery) {
    return (
      <DiscoveryReveal
        species={discovery.species}
        photoSrc={discovery.photoUrl ? `${API_BASE}${discovery.photoUrl}` : null}
        onDone={() => navigate("/dex")}
      />
    );
  }

  if (loadingCatch) {
    return (
      <div className="page">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page">
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
          <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
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
        {!isEdit && coords && <p className="card-meta">📍 Location attached</p>}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading || species.length === 0}>
          {loading ? "Saving..." : isEdit ? "Save changes" : "Save catch"}
        </button>
      </form>
    </div>
  );
}

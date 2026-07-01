import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { identifyPhoto, listMyCatches, listSpecies } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { Species } from "../api/types";
import BottomSheet from "../components/BottomSheet";
import DiscoveryReveal from "../components/DiscoveryReveal";

export default function CameraDetect() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [confirmedSpeciesId, setConfirmedSpeciesId] = useState<number | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [caughtSpeciesIds, setCaughtSpeciesIds] = useState<Set<number> | null>(null);
  const [discoverySpecies, setDiscoverySpecies] = useState<Species | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    startCamera();
    listSpecies()
      .then(setSpecies)
      .catch(() => {});
    listMyCatches()
      .then((catches) => setCaughtSpeciesIds(new Set(catches.map((c) => c.species_id))))
      .catch(() => setCaughtSpeciesIds(new Set()));
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // Torch control is a non-standard extension to MediaTrackCapabilities —
      // supported on most Android browsers, not on iOS Safari (WebKit has no
      // web API for the camera flash at all).
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      setTorchSupported(Boolean(capabilities?.torch));
    } catch {
      setCameraError("Could not access the camera. Check your browser's camera permission.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorchOn(false);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      /* Torch toggle failed — leave state unchanged. */
    }
  }

  async function handleCapture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    setCapturedPhoto({ blob, url });
    setError(null);
    setOverriding(false);
    setConfirmedSpeciesId(null);
    setIdentifying(true);

    try {
      const res = await identifyPhoto(blob);
      setConfirmedSpeciesId(res.species?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Identification failed");
    } finally {
      setIdentifying(false);
    }
  }

  function handleRetake() {
    if (capturedPhoto) URL.revokeObjectURL(capturedPhoto.url);
    setCapturedPhoto(null);
    setError(null);
    setOverriding(false);
    setConfirmedSpeciesId(null);
  }

  function goToLogForm(alreadyRevealed: boolean) {
    if (!capturedPhoto || confirmedSpeciesId == null) return;
    stopCamera();
    navigate("/log", {
      state: {
        speciesId: confirmedSpeciesId,
        photoBlob: capturedPhoto.blob,
        alreadyRevealed,
      },
    });
  }

  function handleConfirm() {
    if (confirmedSpeciesId == null) return;
    const isNew = caughtSpeciesIds != null && !caughtSpeciesIds.has(confirmedSpeciesId);
    if (isNew) {
      const matched = species.find((s) => s.id === confirmedSpeciesId);
      if (matched) {
        setDiscoverySpecies(matched);
        return;
      }
    }
    goToLogForm(false);
  }

  function handleClose() {
    stopCamera();
    navigate("/catches");
  }

  const confirmedSpecies = species.find((s) => s.id === confirmedSpeciesId) ?? null;

  if (discoverySpecies) {
    return (
      <DiscoveryReveal
        species={discoverySpecies}
        photoSrc={capturedPhoto?.url ?? null}
        onDone={() => goToLogForm(true)}
      />
    );
  }

  return (
    <div className="camera-screen">
      <div className="camera-top-bar">
        <button type="button" className="camera-close" onClick={handleClose} aria-label="Close">
          ✕
        </button>
      </div>

      {cameraError ? (
        <div className="page" style={{ color: "#fff", paddingTop: "30svh", textAlign: "center" }}>
          <p>{cameraError}</p>
        </div>
      ) : (
        <video ref={videoRef} className="camera-video" autoPlay muted playsInline />
      )}

      {!capturedPhoto && !cameraError && (
        <div className="camera-controls">
          {torchSupported && (
            <button
              type="button"
              className={`torch-button${torchOn ? " torch-on" : ""}`}
              onClick={toggleTorch}
              aria-label="Toggle flashlight"
            >
              🔦
            </button>
          )}
          <button type="button" className="shutter-button" onClick={handleCapture} aria-label="Capture photo" />
        </div>
      )}

      <BottomSheet open={capturedPhoto != null} onClose={handleRetake}>
        {capturedPhoto && (
          <div className="identify-result">
            <img className="identify-photo" src={capturedPhoto.url} alt="Captured catch" />

            {identifying && (
              <>
                <div className="spinner" />
                <p>Identifying species...</p>
              </>
            )}

            {!identifying && error && <p className="error">{error}</p>}

            {!identifying && !error && !overriding && (
              <>
                {confirmedSpecies ? (
                  <>
                    <span className="identify-species-name">{confirmedSpecies.common_name}</span>
                    {confirmedSpecies.scientific_name && (
                      <span className="identify-sci-name">{confirmedSpecies.scientific_name}</span>
                    )}
                  </>
                ) : (
                  <p>Couldn't confidently match a species in our dex. Pick one manually below.</p>
                )}
                <button type="button" className="link-button" onClick={() => setOverriding(true)}>
                  {confirmedSpecies ? "Not right? Pick manually" : "Pick species manually"}
                </button>
              </>
            )}

            {!identifying && !error && overriding && (
              <div className="form" style={{ width: "100%" }}>
                <label>
                  Species
                  <select
                    value={confirmedSpeciesId ?? ""}
                    onChange={(e) => setConfirmedSpeciesId(Number(e.target.value))}
                  >
                    <option value="" disabled>
                      Choose a species
                    </option>
                    {species.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.common_name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="secondary-button" onClick={() => setOverriding(false)}>
                  Done
                </button>
              </div>
            )}

            {!identifying && !overriding && (
              <div className="identify-actions">
                <button type="button" className="secondary-button" onClick={handleRetake}>
                  Retake
                </button>
                <button type="button" onClick={handleConfirm} disabled={confirmedSpeciesId == null}>
                  Confirm &amp; continue
                </button>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

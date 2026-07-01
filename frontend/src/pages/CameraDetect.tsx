import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { identifyPhoto, listMyCatches, listSpecies } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { Species } from "../api/types";
import BottomSheet from "../components/BottomSheet";
import DiscoveryReveal from "../components/DiscoveryReveal";
import SpeciesRegulations from "../components/SpeciesRegulations";

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
  const [garibaldiAlert, setGaribaldiAlert] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sirenIntervalRef = useRef<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    startCamera();
    listSpecies()
      .then(setSpecies)
      .catch(() => {});
    listMyCatches()
      .then((catches) => setCaughtSpeciesIds(new Set(catches.map((c) => c.species_id))))
      .catch(() => setCaughtSpeciesIds(new Set()));
    return () => {
      stopCamera();
      stopGaribaldiAlert();
      audioCtxRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browsers only allow audio/speech to start inside a user-gesture call stack.
  // The shutter tap is that gesture, but the alert doesn't fire until the
  // identify API call resolves, well after the gesture has expired. So we
  // create (and resume) the AudioContext synchronously in the tap handler,
  // and prime speech synthesis with a silent utterance — both stay usable
  // later even once the async identify response comes back.
  function unlockAudioForGesture() {
    try {
      const AudioCtxCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtxCtor();
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    } catch {
      /* Web Audio unsupported — sound will just be skipped later. */
    }
    if ("speechSynthesis" in window) {
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      window.speechSynthesis.speak(primer);
    }
  }

  function triggerGaribaldiAlert() {
    setGaribaldiAlert(true);
    playAlertSiren();
    speakGaribaldiWarning();
    sirenIntervalRef.current = window.setInterval(() => {
      playAlertSiren();
      speakGaribaldiWarning();
    }, 2200);
  }

  function stopGaribaldiAlert() {
    if (sirenIntervalRef.current != null) {
      window.clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setGaribaldiAlert(false);
  }

  function playAlertSiren() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      const duration = 1.4;
      gain.gain.setValueAtTime(0.25, now);
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(880, now + duration / 4);
      osc.frequency.linearRampToValueAtTime(440, now + duration / 2);
      osc.frequency.linearRampToValueAtTime(880, now + (3 * duration) / 4);
      osc.frequency.linearRampToValueAtTime(440, now + duration);
      gain.gain.setValueAtTime(0.25, now + duration - 0.05);
      gain.gain.linearRampToValueAtTime(0, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      /* Web Audio blocked — silently skip the sound. */
    }
  }

  function speakGaribaldiWarning() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Holy shit, you're so fucked!");
    utterance.pitch = 1.3;
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }

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

    unlockAudioForGesture();

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
      if (res.species?.common_name === "Garibaldi") {
        triggerGaribaldiAlert();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Identification failed");
    } finally {
      setIdentifying(false);
    }
  }

  function handleRetake() {
    stopGaribaldiAlert();
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
    navigate("/dex");
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
                    <SpeciesRegulations species={confirmedSpecies} />
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

      {garibaldiAlert && (
        <div className="garibaldi-alert" onClick={stopGaribaldiAlert}>
          <div className="garibaldi-alert-text">
            🚨💀🐠 HOLY SHIT YOU'RE SO FUCKED 🐠💀🚨
            <br />
            😭🤣☠️🚔🚓 (that's a protected species, genius) 🚓🚔☠️🤣😭
            <br />
            <span className="garibaldi-alert-hint">tap to dismiss</span>
          </div>
        </div>
      )}
    </div>
  );
}

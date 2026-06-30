import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { identifyPhoto } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { IdentifyResult } from "../api/types";
import BottomSheet from "../components/BottomSheet";

export default function CameraDetect() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    startCamera();
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
    } catch {
      setCameraError("Could not access the camera. Check your browser's camera permission.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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
    setIdentifying(true);

    try {
      const res = await identifyPhoto(blob);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Identification failed");
    } finally {
      setIdentifying(false);
    }
  }

  function handleRetake() {
    if (capturedPhoto) URL.revokeObjectURL(capturedPhoto.url);
    setCapturedPhoto(null);
    setResult(null);
    setError(null);
  }

  function handleLogCatch() {
    if (!capturedPhoto) return;
    stopCamera();
    navigate("/log", {
      state: {
        speciesId: result?.species?.id ?? null,
        photoBlob: capturedPhoto.blob,
      },
    });
  }

  function handleClose() {
    stopCamera();
    navigate("/catches");
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

            {!identifying && !error && result && (
              <>
                {result.species ? (
                  <>
                    <span className="identify-species-name">{result.species.common_name}</span>
                    {result.species.scientific_name && (
                      <span className="identify-sci-name">{result.species.scientific_name}</span>
                    )}
                  </>
                ) : (
                  <p>Couldn't confidently match a species in our dex. You can still log it manually.</p>
                )}
              </>
            )}

            {!identifying && (
              <div className="identify-actions">
                <button type="button" className="secondary-button" onClick={handleRetake}>
                  Retake
                </button>
                <button type="button" onClick={handleLogCatch}>
                  Log this catch
                </button>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

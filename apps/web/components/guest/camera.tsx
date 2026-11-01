"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";

type Facing = "environment" | "user";
type CameraState = "starting" | "ready" | "denied" | "unavailable" | "busy";

const JPEG_QUALITY = 0.92;

const messages: Record<"denied" | "unavailable" | "busy", string> = {
  denied:
    "Sans l'accès à la caméra, vous ne pouvez pas prendre de photo ici. Pour l'autoriser, ouvrez les réglages du site dans votre navigateur. Vous pouvez aussi importer une photo.",
  unavailable:
    "La caméra n'est pas disponible dans cette application. Ouvrez ce lien dans Safari ou Chrome, ou importez une photo.",
  busy: "La caméra est déjà utilisée par une autre application. Fermez-la, puis réessayez, ou importez une photo.",
};

function stateForError(error: unknown): CameraState {
  const name = (error as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "unavailable";
}

interface Props {
  onCapture: (photo: Blob) => void;
  onCancel: () => void;
  onImport?: () => void;
}

export function Camera({ onCapture, onCancel, onImport }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [facing, setFacing] = useState<Facing>("environment");
  const [canSwitch, setCanSwitch] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let active = true;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      try {
        setState("starting");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (video.current) video.current.srcObject = stream;
        setState("ready");

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (active) {
          setCanSwitch(
            devices.filter((device) => device.kind === "videoinput").length > 1
          );
        }
      } catch (error) {
        if (active) setState(stateForError(error));
      }
    }

    start();
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [facing]);

  function capture() {
    const source = video.current;
    if (!source?.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
    canvas.getContext("2d")?.drawImage(source, 0, 0);
    canvas.toBlob(
      (photo) => {
        if (photo) onCapture(photo);
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  }

  if (state === "denied" || state === "unavailable" || state === "busy") {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-4">
        <ErrorMessage>{messages[state]}</ErrorMessage>
        <Button onClick={onImport}>Importer une photo</Button>
        <Button variant="secondary" onClick={onCancel}>
          Retour
        </Button>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-black">
      <div className="relative min-h-0 flex-1">
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          aria-label="Aperçu de la caméra"
          className={`size-full object-cover ${
            facing === "user" ? "-scale-x-100" : ""
          }`}
        />
        {state === "starting" && (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center">
            Autorisez la caméra pour prendre votre photo.
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 p-4">
        <Button variant="secondary" onClick={onCancel}>
          Retour
        </Button>
        <Button onClick={capture} disabled={state !== "ready"}>
          Prendre la photo
        </Button>
        {canSwitch && (
          <Button
            variant="secondary"
            aria-label="Changer de caméra"
            onClick={() =>
              setFacing((current) =>
                current === "user" ? "environment" : "user"
              )
            }
          >
            ⟲
          </Button>
        )}
      </div>
    </main>
  );
}

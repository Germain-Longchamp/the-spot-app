"use client";

import { useEffect, useRef, useState } from "react";
import { Screen } from "@/components/guest/screen";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { CloseIcon, ImageIcon, SwitchCameraIcon } from "@/components/ui/icons";

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
  // A white flash on capture: the guest sees the photo was taken.
  const [flash, setFlash] = useState(0);

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
    setFlash((count) => count + 1);
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
      <Screen
        stepKey="camera-error"
        back={{ label: "Retour", onClick: onCancel }}
        title="Caméra indisponible"
        footer={
          <Button icon={<ImageIcon size={20} />} onClick={onImport}>
            Importer une photo
          </Button>
        }
      >
        <ErrorMessage>{messages[state]}</ErrorMessage>
      </Screen>
    );
  }

  const round =
    "flex size-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-transform active:scale-90";

  return (
    <main className="fixed inset-0 flex flex-col bg-black text-white">
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
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-lg">
            Autorisez la caméra pour prendre votre photo.
          </p>
        )}
        {flash > 0 && (
          <span
            key={flash}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 animate-flash bg-white"
          />
        )}

        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <button type="button" aria-label="Retour" onClick={onCancel} className={round}>
            <CloseIcon size={24} />
          </button>
          {canSwitch && (
            <button
              type="button"
              aria-label="Changer de caméra"
              onClick={() =>
                setFacing((current) =>
                  current === "user" ? "environment" : "user"
                )
              }
              className={round}
            >
              <SwitchCameraIcon size={24} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 bg-black px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        <button
          type="button"
          aria-label="Prendre la photo"
          onClick={capture}
          disabled={state !== "ready"}
          className="flex size-20 items-center justify-center rounded-full border-4 border-white transition-transform active:scale-90 disabled:opacity-40"
        >
          <span className="size-[60px] rounded-full bg-white" />
        </button>
        <p className="text-sm text-white/80">Cadrez, puis appuyez sur le bouton</p>
      </div>
    </main>
  );
}

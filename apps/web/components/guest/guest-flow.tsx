"use client";

import { useRef, useState } from "react";
import { Camera } from "@/components/guest/camera";
import { EventHome } from "@/components/guest/event-home";
import { PhotoPreview } from "@/components/guest/photo-preview";
import type { GuestEvent } from "@/lib/guest/enter-event";
import { importPhoto } from "@/lib/guest/import-photo";

type Screen =
  | { name: "home" }
  | { name: "camera" }
  | { name: "preview"; photo: Blob };

interface Props {
  event: GuestEvent;
  token: string;
}

/** The steps stay on one page: the photo must not leave the phone before the guest validates it. */
export function GuestFlow({ event, token }: Props) {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const home = () => setScreen({ name: "home" });

  function chooseFile() {
    setImportError(null);
    home();
    fileInput.current?.click();
  }

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Choosing the same file twice must fire this handler again.
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    const result = await importPhoto(file);
    setImporting(false);

    if ("photo" in result) setScreen({ name: "preview", photo: result.photo });
    else setImportError(result.error);
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,.heic,.heif"
        aria-label="Choisir une photo"
        className="hidden"
        onChange={onFileChosen}
      />

      {screen.name === "camera" && (
        <Camera
          onCapture={(photo) => setScreen({ name: "preview", photo })}
          onCancel={home}
          onImport={chooseFile}
        />
      )}

      {screen.name === "preview" && (
        <PhotoPreview photo={screen.photo} onRetake={home} />
      )}

      {screen.name === "home" && (
        <EventHome
          event={event}
          token={token}
          importing={importing}
          importError={importError}
          onTakePhoto={() => setScreen({ name: "camera" })}
          onImportPhoto={chooseFile}
        />
      )}
    </>
  );
}

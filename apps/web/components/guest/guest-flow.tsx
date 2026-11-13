"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "@/components/guest/camera";
import { PhotoDetail, PrintBanner, useAlbum } from "@/components/guest/album";
import { EventHome } from "@/components/guest/event-home";
import { PhotoPreview } from "@/components/guest/photo-preview";
import { Prints } from "@/components/guest/prints";
import type { GuestEvent } from "@/lib/guest/enter-event";
import { countGalleryPhotos, PRINTS_HASH, TAKE_PHOTO_HASH } from "@/lib/guest/gallery";
import { importPhoto } from "@/lib/guest/import-photo";
import { createClient } from "@/lib/supabase/client";

type Screen =
  | { name: "home" }
  | { name: "camera" }
  | { name: "preview"; photo: Blob }
  | { name: "prints" }
  | { name: "photo"; photoId: string };

interface Props {
  event: GuestEvent;
  guestId: string;
  token: string;
}

/** The steps stay on one page: the photo must not leave the phone before the guest validates it. */
export function GuestFlow({ event, guestId, token }: Props) {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const home = () => setScreen({ name: "home" });

  // "Prendre une photo" from the gallery (SCRUM-54): straight to the camera,
  // and the hash goes, so a reload lands on the home.
  // From a photo of the gallery (SCRUM-55): straight to "Vos tirages".
  useEffect(() => {
    const hash = window.location.hash;
    if (hash !== `#${TAKE_PHOTO_HASH}` && hash !== `#${PRINTS_HASH}`) return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setScreen(hash === `#${PRINTS_HASH}` ? { name: "prints" } : { name: "camera" });
  }, []);
  const openPrints = () => setScreen({ name: "prints" });
  const openPhoto = (photoId: string) => setScreen({ name: "photo", photoId });
  const galleryHref = `/e/${token}/galerie`;

  // Read only on the screens that show it: never while taking a photo.
  const albumShown = screen.name === "home" || screen.name === "prints" || screen.name === "photo";
  const album = useAlbum(event.id, guestId, albumShown);
  const items = album.items ?? [];
  const opened = screen.name === "photo" ? items.find((item) => item.photoId === screen.photoId) : undefined;

  // The number under the gallery entry, read again each time the home shows.
  const [galleryCount, setGalleryCount] = useState<number | null>(null);
  const onHome = screen.name === "home";
  useEffect(() => {
    if (!onHome) return;
    let active = true;
    const scope = event.galleryEnabled && event.galleryVisible ? "shared" : "mine";
    countGalleryPhotos(createClient(), event.id, scope).then(
      (count) => active && count !== null && setGalleryCount(count)
    );
    return () => {
      active = false;
    };
  }, [onHome, event.id, event.galleryEnabled, event.galleryVisible]);

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
        <PhotoPreview
          photo={screen.photo}
          eventId={event.id}
          guestId={guestId}
          galleryEnabled={event.galleryEnabled}
          galleryVisible={event.galleryVisible}
          frameTitle={event.frameTitle}
          galleryHref={galleryHref}
          onDone={home}
          onAnother={() => setScreen({ name: "camera" })}
        />
      )}

      {/* A photo that vanished meanwhile (removed by the team): back home. */}
      {(screen.name === "home" || (screen.name === "photo" && !opened)) && (
        <EventHome
          event={event}
          token={token}
          importing={importing}
          importError={importError}
          onTakePhoto={() => setScreen({ name: "camera" })}
          onImportPhoto={chooseFile}
          banner={<PrintBanner items={items} onOpen={openPrints} />}
          galleryCount={galleryCount}
        />
      )}

      {screen.name === "prints" && (
        <Prints
          items={items}
          offline={album.offline}
          eventId={event.id}
          onBack={home}
          onOpen={openPhoto}
          onTakePhoto={() => setScreen({ name: "camera" })}
        />
      )}

      {screen.name === "photo" && opened && (
        <PhotoDetail
          key={opened.photoId}
          item={opened}
          eventId={event.id}
          backLabel="Vos tirages"
          onBack={openPrints}
          onPrinted={album.refresh}
        />
      )}
    </>
  );
}

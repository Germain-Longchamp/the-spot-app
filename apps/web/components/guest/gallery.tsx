"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Logo } from "@/components/ui/logo";
import type { GuestEvent } from "@/lib/guest/enter-event";
import {
  GalleryPhoto,
  loadGalleryPage,
  signFullImage,
} from "@/lib/guest/gallery";
import { createClient } from "@/lib/supabase/client";

interface Props {
  event: GuestEvent;
  token: string;
}

export function Gallery({ event, token }: Props) {
  const open = event.galleryEnabled && event.galleryVisible;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <Logo variant="short" width={140} />
        <Link href={`/e/${token}`} className="min-h-12 py-3 underline">
          Retour à l&apos;accueil
        </Link>
      </header>
      <h1 className="text-2xl font-semibold">Galerie de l&apos;événement</h1>

      {open ? (
        <GalleryGrid eventId={event.id} />
      ) : (
        // Nothing is even asked for: a hidden gallery loads no photo.
        <p className="text-lg">
          La galerie sera disponible plus tard. Revenez un peu après !
        </p>
      )}
    </main>
  );
}

function GalleryGrid({ eventId }: { eventId: string }) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const supabase = useRef(createClient());

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setFailed(false);
      const result = await loadGalleryPage(supabase.current, eventId, nextPage);
      setLoading(false);
      if (!result) {
        setFailed(true);
        return;
      }
      setPhotos((current) =>
        nextPage === 0 ? result.photos : [...current, ...result.photos]
      );
      setPage(nextPage);
      setMore(result.more);
    },
    [eventId]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  /** A photo removed while someone looks at the gallery just disappears. */
  const forget = (id: string) =>
    setPhotos((current) => current.filter((photo) => photo.id !== id));

  if (!loading && !failed && photos.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-lg">
          Aucune photo pour l&apos;instant. Partagez la vôtre depuis
          l&apos;accueil : elle apparaîtra ici.
        </p>
        <Button variant="secondary" onClick={() => load(0)}>
          Actualiser
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" onClick={() => load(0)} disabled={loading}>
        Actualiser
      </Button>

      <ul className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setOpened(photo.fullPath)}
              className="block w-full"
              aria-label="Agrandir la photo"
            >
              {/* Signed, short-lived links: an image optimizer would cache them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbUrl}
                alt="Photo de la galerie"
                loading="lazy"
                onError={() => forget(photo.id)}
                className="aspect-square w-full rounded-lg object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      {loading && (
        <p role="status" className="text-muted">
          Chargement de la galerie…
        </p>
      )}

      {failed && (
        <ErrorMessage>
          Les photos n&apos;ont pas pu être chargées. Vérifiez votre
          connexion, puis touchez « Actualiser ».
        </ErrorMessage>
      )}

      {more && !loading && (
        <Button variant="secondary" onClick={() => load(page + 1)}>
          Voir plus de photos
        </Button>
      )}

      {opened && <Viewer path={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}

function Viewer({ path, onClose }: { path: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    signFullImage(createClient(), path).then((signed) => {
      if (!active) return;
      if (signed) setUrl(signed);
      else setFailed(true);
    });
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      active = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [path, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo agrandie"
      className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/95 p-4"
    >
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Photo agrandie"
          onError={() => setFailed(true)}
          className="max-h-[80vh] max-w-full rounded-lg object-contain"
        />
      )}
      {!url && !failed && (
        <p role="status" className="text-muted">
          Chargement de la photo…
        </p>
      )}
      {failed && <ErrorMessage>Cette photo n&apos;est plus disponible.</ErrorMessage>}
      <Button onClick={onClose}>Fermer</Button>
    </div>
  );
}

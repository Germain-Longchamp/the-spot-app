"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Logo } from "@/components/ui/logo";
import { MyPrints } from "@/components/guest/my-prints";
import { sendPhoto } from "@/lib/guest/send-photo";
import { createClient } from "@/lib/supabase/client";

const unavailableMessages: Record<string, string> = {
  paused:
    "Les impressions sont en pause pour le moment. Merci de patienter quelques instants.",
  limit_reached:
    "Le nombre maximum d'impressions de cet événement est atteint.",
  closed: "Cet événement est terminé : les impressions ne sont plus possibles.",
};

const failure =
  "Votre photo n'a pas pu être envoyée. Vérifiez votre connexion, puis réessayez.";
const closed = "Cet événement est terminé : votre photo n'a pas été envoyée.";

interface Props {
  photo: Blob;
  eventId: string;
  guestId: string;
  galleryEnabled: boolean;
  galleryVisible: boolean;
  onDone: () => void;
}

export function PhotoPreview({
  photo,
  eventId,
  guestId,
  galleryEnabled,
  galleryVisible,
  onDone,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  // Fixed for this photo: pressing twice, or again after a failure, can only
  // ever produce one photo. A ref also stops a double tap before any render.
  const photoId = useMemo(() => crypto.randomUUID(), []);
  const sent = useRef(false);
  const sending = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  useEffect(() => {
    let active = true;
    createClient()
      .rpc("get_print_availability", { p_event_id: eventId })
      .then(({ data }) => {
        if (active) setUnavailable(unavailableMessages[data] ?? null);
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  function ensureSent(): Promise<boolean> {
    if (sent.current) return Promise.resolve(true);
    sending.current ??= (async () => {
      setError(null);
      setProgress(0);
      const result = await sendPhoto({
        supabase: createClient(),
        photo,
        photoId,
        eventId,
        guestId,
        published: galleryEnabled && published,
        onProgress: setProgress,
        onRetry: () => setRetrying(true),
      });
      setProgress(null);
      setRetrying(false);
      sending.current = null;

      if (result === "sent") sent.current = true;
      else setError(result === "event_closed" ? closed : failure);
      return result === "sent";
    })();
    return sending.current;
  }

  async function validate() {
    if (await ensureSent()) setDone(true);
  }

  const busy = progress !== null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col gap-4 p-4">
      <Logo variant="icon" width={28} className="self-center" />
      {url && (
        // A local blob: there is nothing for an image optimizer to do.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Votre photo" className="w-full rounded-lg" />
      )}

      {!done && galleryEnabled && (
        <label className="flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            checked={published}
            disabled={busy}
            onChange={(event) => setPublished(event.target.checked)}
            className="size-5"
          />
          Ajouter à la galerie de l&apos;événement
        </label>
      )}

      {busy && (
        <div className="flex flex-col gap-1">
          <p role="status">
            {retrying
              ? "La connexion est lente, nous réessayons. Ne fermez pas la page."
              : "Envoi de votre photo…"}
          </p>
          <progress
            aria-label="Progression de l'envoi"
            value={progress}
            max={1}
            className="w-full"
          />
        </div>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <PrintButton
        photoId={photoId}
        eventId={eventId}
        unavailable={unavailable}
        beforePrint={ensureSent}
        onCreated={() => {
          setPrinted(true);
          setDone(true);
        }}
      />

      {printed && (
        // The print button above already shows the printer's state.
        <MyPrints eventId={eventId} photoId={photoId} showPrinterStatus={false} />
      )}

      {done && !printed && (
        <p role="status">
          {!(published && galleryEnabled)
            ? "Votre photo est bien envoyée."
            : galleryVisible
              ? "Votre photo est bien envoyée et ajoutée à la galerie."
              : "Votre photo est bien envoyée. Elle apparaîtra dans la galerie dès son ouverture."}
        </p>
      )}

      {done ? (
        <Button variant="secondary" onClick={onDone}>
          Prendre une autre photo
        </Button>
      ) : (
        <>
          <Button variant="secondary" disabled={busy} onClick={validate}>
            {error ? "Réessayer sans imprimer" : "Valider sans imprimer"}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onDone}>
            Reprendre
          </Button>
        </>
      )}
    </main>
  );
}

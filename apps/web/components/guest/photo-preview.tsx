"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MyPrints } from "@/components/guest/my-prints";
import { Screen } from "@/components/guest/screen";
import { PrintPreview } from "@/components/guest/print-preview";
import { PrintZoom } from "@/components/guest/print-zoom";
import { PrinterStatus } from "@/components/printer-status";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { CameraIcon, GalleryIcon, PrinterIcon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import { sendPhoto } from "@/lib/guest/send-photo";
import type { FrameText } from "@/lib/print/layout";
import { unavailableMessages } from "@/lib/print/availability";
import { printRequestMessages } from "@/lib/print/request-print";
import { usePrintRequest } from "@/lib/print/use-print-request";
import { createClient } from "@/lib/supabase/client";


const failure =
  "Votre photo n'a pas pu être envoyée. Vérifiez votre connexion, puis réessayez.";
const closed = "Cet événement est terminé : votre photo n'a pas été envoyée.";

type Stage = "review" | "sending" | "done";

/** Long enough to read two short lines. */
const GALLERY_HINT_MS = 4000;

interface Props {
  photo: Blob;
  eventId: string;
  guestId: string;
  galleryEnabled: boolean;
  galleryVisible: boolean;
  /** Printed in the band below the photo (SCRUM-60, 62). */
  frameTitle: string;
  /** Link to the gallery, where the guest finds all their photos (SCRUM-63). */
  galleryHref?: string;
  /** Back to the event home. */
  onDone: () => void;
  /** Straight to the camera, for the next photo. */
  onAnother?: () => void;
}

/**
 * From the photo just taken to the end of the flow, one screen per step:
 * review, sending, done. Nothing leaves the phone before the guest chooses.
 */
export function PhotoPreview({
  photo,
  eventId,
  guestId,
  galleryEnabled,
  galleryVisible,
  frameTitle,
  galleryHref,
  onDone,
  onAnother,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("review");
  // Shared by default; the guest can untick it (Germain, 2026-11-11, SCRUM-63).
  const [published, setPublished] = useState(galleryEnabled);
  const [progress, setProgress] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  // Until the guest can write their own (SCRUM-61): the event's frame text.
  const frame = useMemo(() => ({ line1: frameTitle, line2: null }), [frameTitle]);
  const closeZoom = useCallback(() => setZoomed(false), []);
  const [galleryHint, setGalleryHint] = useState(false);
  useEffect(() => {
    if (!galleryHint) return;
    const timer = setTimeout(() => setGalleryHint(false), GALLERY_HINT_MS);
    return () => clearTimeout(timer);
  }, [galleryHint]);

  // Fixed for this photo: pressing twice, or again after a failure, can only
  // ever produce one photo. A ref also stops a double tap before any render.
  const photoId = useMemo(() => crypto.randomUUID(), []);
  const sent = useRef(false);
  const sending = useRef<Promise<boolean> | null>(null);
  const print = usePrintRequest(photoId);

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

  // One action at a time: a double tap must not start a second one, nor
  // bounce the screen back while the first is still running.
  const acting = useRef(false);

  async function validate() {
    if (acting.current) return;
    acting.current = true;
    setStage("sending");
    setStage((await ensureSent()) ? "done" : "review");
    acting.current = false;
  }

  async function printPhoto() {
    if (acting.current) return;
    acting.current = true;
    const fromDone = stage === "done";
    setStage("sending");
    const outcome = await print.press(ensureSent);
    if (outcome === "created") {
      setPrinted(true);
      setStage("done");
    } else {
      // The upload failed (error is set) or the server said no (outcome
      // message): back where the guest was, the photo is not lost.
      setStage(fromDone && sent.current ? "done" : "review");
    }
    acting.current = false;
  }

  const inGallery = galleryEnabled && published;
  const refusal =
    print.outcome && print.outcome !== "created"
      ? printRequestMessages[print.outcome]
      : null;

  if (stage === "sending") {
    return (
      <Screen stepKey="sending">
        <SendingView progress={progress} retrying={retrying} />
      </Screen>
    );
  }

  if (stage === "done") {
    return (
      <Screen
        stepKey={printed ? "printed" : "saved"}
        footer={
          <>
            <Button icon={<CameraIcon size={20} />} onClick={onAnother ?? onDone}>
              Prendre une autre photo
            </Button>
            <Button variant="secondary" onClick={onDone}>
              Retour à l&apos;accueil
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <SuccessMark />
          <h1 className="text-2xl font-semibold">
            {printed ? "C'est parti pour l'impression !" : "Photo enregistrée"}
          </h1>
          <p role="status" className="text-muted">
            {printed
              ? printRequestMessages.created
              : !inGallery
                ? "Votre photo est bien envoyée."
                : galleryVisible
                  ? "Votre photo est bien envoyée et ajoutée à la galerie."
                  : "Votre photo est bien envoyée. Elle apparaîtra dans la galerie dès son ouverture."}
          </p>
        </div>


        {printed ? (
          <div className="flex flex-col gap-3">
            {/* Always visible on the print screens (UX rule 1), even before
                the request shows up in the tracking below. */}
            <PrinterStatus eventId={eventId} />
            <MyPrints eventId={eventId} photoId={photoId} showPrinterStatus={false} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {refusal && <ErrorMessage>{refusal}</ErrorMessage>}
            <Button
              variant="secondary"
              icon={<PrinterIcon size={20} />}
              onClick={printPhoto}
              disabled={print.finished || unavailable !== null}
            >
              Imprimer
            </Button>
            {unavailable && <p className="text-sm text-muted">{unavailable}</p>}
          </div>
        )}

        {url && <Polaroid src={url} frame={frame} small />}

        {galleryHref && (
          <div className="flex justify-center">
            <Link
              href={galleryHref}
              className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline"
            >
              <GalleryIcon size={20} />
              Voir la galerie
            </Link>
          </div>
        )}
      </Screen>
    );
  }

  // Everything the guest needs to decide sits in the bar, next to the
  // buttons: never under the fold (UX rule 1, SCRUM-52). Kept short, so the
  // print gets the room (SCRUM-66): the printer status goes up in the header.
  return (
    <Screen
      stepKey="review"
      fit
      back={{ label: "Reprendre", onClick: onDone }}
      aside={<PrinterStatus eventId={eventId} compact />}
      footer={
        <>

          {(unavailable || refusal) && (
            <p
              role="status"
              className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-on-brand"
            >
              {refusal ?? unavailable}
            </p>
          )}
          {error && <ErrorMessage>{error}</ErrorMessage>}

          {galleryEnabled && (
            <div className="relative">
              {/* What sharing means, said once when it is turned on. */}
              {galleryHint && published && (
                <p
                  role="status"
                  data-testid="gallery-hint"
                  className="absolute inset-x-0 bottom-full mb-3 animate-pop-in rounded-xl bg-foreground px-3 py-2 text-sm text-surface shadow-lift"
                >
                  {galleryVisible
                    ? "Les autres invités pourront la voir et l'enregistrer."
                    : "Elle sera visible, et enregistrable, à l'ouverture de la galerie."}
                </p>
              )}
              <Switch
                bare
                label="Ajouter à la galerie"
                checked={published}
                onChange={(checked) => {
                  setPublished(checked);
                  setGalleryHint(checked);
                }}
              />
            </div>
          )}

          <Button
            icon={<PrinterIcon size={20} />}
            onClick={printPhoto}
            disabled={print.finished || unavailable !== null}
          >
            Imprimer
          </Button>
          <button
            type="button"
            onClick={validate}
            className="-my-1 min-h-11 self-center px-4 font-semibold text-muted underline underline-offset-4 transition-transform active:scale-95"
          >
            {error ? "Réessayer sans imprimer" : "Valider sans imprimer"}
          </button>
        </>
      }
    >
      {url && (
        // The print on a grey table, so its white borders read as paper; the
        // table spans the screen, the print gets all its width.
        <div className="-mx-4 flex min-h-0 flex-1 bg-divider/60 p-3">
          <PrintPreview src={url} fit frame={frame} onOpen={() => setZoomed(true)} />
        </div>
      )}
      {url && zoomed && <PrintZoom src={url} frame={frame} onClose={closeZoom} />}
    </Screen>
  );
}

/** The print as it will come out (SCRUM-65), small or filling the room left. */
function Polaroid({
  src,
  frame,
  small = false,
  fit = false,
}: {
  src: string;
  frame: FrameText;
  small?: boolean;
  fit?: boolean;
}) {
  return <PrintPreview src={src} frame={frame} fit={fit} maxWidth={small ? "11rem" : "24rem"} />;
}

function SendingView({
  progress,
  retrying,
}: {
  progress: number | null;
  retrying: boolean;
}) {
  const uploading = progress !== null;
  const circumference = 2 * Math.PI * 44;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <div className="relative size-32">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r="44" className="fill-none stroke-divider" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r="44"
            className={`fill-none stroke-accent transition-[stroke-dashoffset] duration-300 ${
              uploading ? "" : "animate-soft-pulse"
            }`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - (progress ?? 1))}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-accent">
          <PrinterIcon size={36} />
        </span>
      </div>
      <p role="status" className="text-lg font-semibold">
        {retrying
          ? "La connexion est lente, nous réessayons. Ne fermez pas la page."
          : uploading
            ? "Envoi de votre photo…"
            : "Envoi de votre demande…"}
      </p>
      {uploading && (
        <progress
          aria-label="Progression de l'envoi"
          value={progress ?? 0}
          max={1}
          className="sr-only"
        />
      )}
      <p className="text-muted">Quelques secondes, nous nous occupons de tout.</p>
    </div>
  );
}

/** A check that draws itself: the flow is over, and it went well. */
function SuccessMark() {
  return (
    <span className="flex size-20 animate-pop-in items-center justify-center rounded-full bg-success text-surface shadow-lift">
      <svg viewBox="0 0 24 24" className="size-10" aria-hidden="true">
        <path
          d="M20 6 9 17l-5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="24"
          strokeDashoffset="24"
          className="animate-draw-check"
        />
      </svg>
    </span>
  );
}

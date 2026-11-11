"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrintSteps } from "@/components/guest/print-steps";
import { Screen } from "@/components/guest/screen";
import { PrinterStatus } from "@/components/printer-status";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import {
  CheckIcon,
  ChevronRightIcon,
  GalleryIcon,
  ImageIcon,
  PrinterIcon,
} from "@/components/ui/icons";
import { AlbumItem, canPrint, isActive, loadAlbum } from "@/lib/guest/album";
import { signFullImage } from "@/lib/guest/gallery";
import { unavailableMessages } from "@/lib/print/availability";
import type { PrintJobStatus } from "@/lib/print/job-status";
import { printRequestMessages } from "@/lib/print/request-print";
import { usePrintRequest } from "@/lib/print/use-print-request";
import { createClient } from "@/lib/supabase/client";

/** Same pace as the print tracking: live enough, light on the salon network. */
export const ALBUM_POLL_INTERVAL_MS = 5_000;

/** Short labels for the badges; the detail shows the full sentence. */
const badge: Record<PrintJobStatus | "NONE", { text: string; tone: string }> = {
  DONE: { text: "Prête à récupérer", tone: "bg-success text-surface" },
  STUCK: { text: "Un souci : voyez l'équipe", tone: "bg-danger text-surface" },
  FAILED: { text: "Un souci : voyez l'équipe", tone: "bg-danger text-surface" },
  PRINTING: { text: "Impression en cours", tone: "bg-accent text-on-accent" },
  PENDING: { text: "En attente de validation", tone: "bg-brand-soft text-on-brand" },
  CANCELLED: { text: "Annulée", tone: "bg-divider text-foreground" },
  NONE: { text: "Non imprimée", tone: "bg-surface text-foreground border border-border" },
};

/** One sentence for the home banner, the most urgent request first. */
const bannerText: Partial<Record<PrintJobStatus, string>> = {
  DONE: "Votre photo est prête : à récupérer près de l'imprimante.",
  STUCK: "Un souci avec votre impression : rendez-vous auprès de l'équipe.",
  FAILED: "Un souci avec votre impression : rendez-vous auprès de l'équipe.",
  PRINTING: "Votre photo est en cours d'impression.",
  PENDING: "Votre impression attend la validation de l'équipe.",
};

/**
 * The guest's photos and prints, read again every few seconds: the home
 * banner and the print button of the guest's own photos in the gallery. Paused while
 * the guest takes or reviews a photo; a failed read keeps the last state.
 */
export function useAlbum(eventId: string, guestId: string, enabled: boolean) {
  const [items, setItems] = useState<AlbumItem[] | null>(null);
  const [offline, setOffline] = useState(false);
  const busy = useRef(false);
  const client = useRef(createClient());

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const result = await loadAlbum(client.current, eventId, guestId);
    busy.current = false;
    if (result === null) setOffline(true);
    else {
      setOffline(false);
      setItems(result);
    }
  }, [eventId, guestId]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const timer = setInterval(refresh, ALBUM_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh]);

  return { items, offline, refresh };
}

function StatusBadge({ item }: { item: AlbumItem }) {
  const { text, tone } = badge[item.print?.status ?? "NONE"];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {text}
    </span>
  );
}

function Thumb({ item, className = "" }: { item: AlbumItem; className?: string }) {
  return item.thumbUrl ? (
    // Signed, short-lived links: an image optimizer would cache them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.thumbUrl}
      alt="Une de vos photos"
      loading="lazy"
      className={`aspect-square w-full rounded-xl bg-divider object-cover ${className}`}
    />
  ) : (
    <span
      className={`flex aspect-square w-full items-center justify-center rounded-xl bg-divider text-muted ${className}`}
    >
      <ImageIcon size={28} />
      <span className="sr-only">Photo indisponible</span>
    </span>
  );
}

/** On the event home: the one request the guest should hear about now. */
export function PrintBanner({
  items,
  onOpen,
}: {
  items: AlbumItem[];
  onOpen: (photoId: string) => void;
}) {
  const active = items.find((item) => isActive(item));
  if (!active?.print) return null;
  const status = active.print.status;
  const problem = status === "STUCK" || status === "FAILED";

  return (
    <button
      type="button"
      data-testid="print-banner"
      onClick={() => onOpen(active.photoId)}
      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left shadow-card transition-transform active:scale-[0.98] ${
        status === "DONE"
          ? "bg-success text-surface"
          : problem
            ? "bg-danger text-surface"
            : "bg-surface text-foreground"
      }`}
    >
      <span className="size-12 shrink-0 overflow-hidden rounded-xl">
        <Thumb item={active} className="rounded-none" />
      </span>
      <span role="status" aria-live="polite" className="flex-1 font-semibold">
        {bannerText[status]}
      </span>
      {status === "DONE" ? <CheckIcon size={22} /> : <ChevronRightIcon size={22} />}
    </button>
  );
}

/** One photo: large, with its print tracking, or the way to print it. */
export function PhotoDetail({
  item,
  eventId,
  backLabel,
  onBack,
  onPrinted,
}: {
  item: AlbumItem;
  eventId: string;
  /** Where "back" goes: the home (print banner) or the gallery. */
  backLabel: string;
  onBack: () => void;
  /** Reload the album, so the new request shows up at once. */
  onPrinted: () => void;
}) {
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const print = usePrintRequest(item.photoId);
  const printable = canPrint(item);
  const client = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;
    signFullImage(client, item.fullPath).then((url) => active && setFullUrl(url));
    return () => {
      active = false;
    };
  }, [client, item.fullPath]);

  useEffect(() => {
    if (!printable) return;
    let active = true;
    client
      .rpc("get_print_availability", { p_event_id: eventId })
      .then(({ data }) => active && setUnavailable(unavailableMessages[data] ?? null));
    return () => {
      active = false;
    };
  }, [client, eventId, printable]);

  async function printIt() {
    if ((await print.press()) === "created") onPrinted();
  }

  const refusal =
    print.outcome && print.outcome !== "created" ? printRequestMessages[print.outcome] : null;
  const src = fullUrl ?? item.thumbUrl;

  return (
    <Screen
      stepKey={`photo-${item.photoId}`}
      back={{ label: backLabel, onClick: onBack }}
      title="Votre photo"
      footer={
        printable ? (
          <Button
            icon={<PrinterIcon size={20} />}
            onClick={printIt}
            loading={print.sending}
            disabled={print.finished || unavailable !== null}
          >
            Imprimer
          </Button>
        ) : undefined
      }
    >
      <div className="mx-auto w-full max-w-sm rounded-2xl bg-surface p-3 pb-8 shadow-lift">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Votre photo" className="max-h-[52dvh] w-full rounded-lg object-contain" />
        ) : (
          <span className="flex aspect-square items-center justify-center text-muted">
            <ImageIcon size={40} />
            <span className="sr-only">Photo indisponible</span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusBadge item={item} />
        {item.published && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
            <GalleryIcon size={12} />
            Dans la galerie
          </span>
        )}
      </div>

      {item.print && item.print.status !== "CANCELLED" ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card">
          <PrinterStatus eventId={eventId} />
          <PrintSteps status={item.print.status} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {item.print?.status === "CANCELLED" && (
            <p className="text-muted">Votre précédente demande a été annulée par l&apos;équipe.</p>
          )}
          <PrinterStatus eventId={eventId} />
          {(refusal ?? unavailable) && (
            <p role="status" className="rounded-2xl bg-brand-soft p-4 text-on-brand">
              {refusal ?? unavailable}
            </p>
          )}
        </div>
      )}

      {print.outcome === "unexpected_error" && (
        <ErrorMessage>{printRequestMessages.unexpected_error}</ErrorMessage>
      )}
    </Screen>
  );
}

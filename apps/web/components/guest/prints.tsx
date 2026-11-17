"use client";

import { useEffect, useMemo, useState } from "react";
import { PrintPreview } from "@/components/guest/print-preview";
import { PrintZoom } from "@/components/guest/print-zoom";
import { Screen } from "@/components/guest/screen";
import { PrinterStatus } from "@/components/printer-status";
import { Button } from "@/components/ui/button";
import { CameraIcon } from "@/components/ui/icons";
import {
  AlbumItem,
  isActive,
  printsSummary,
  queueText,
  sortPrints,
} from "@/lib/guest/album";
import { signFullImage } from "@/lib/guest/gallery";
import { createClient } from "@/lib/supabase/client";

/** The card of one print: its state in a word, then what it means for the guest. */
function describe(item: AlbumItem): { chip: string; detail: string; tone: string } {
  const print = item.print!;
  switch (print.status) {
    case "DONE":
      return {
        chip: "Prête à récupérer",
        detail: "Elle vous attend près de l'imprimante",
        tone: "bg-brand text-on-brand",
      };
    case "STUCK":
    case "FAILED":
      return {
        chip: "Un souci",
        detail: "Un souci avec votre impression : rendez-vous auprès de l'équipe.",
        tone: "bg-danger text-surface",
      };
    case "PRINTING":
      return {
        chip: "Impression en cours",
        detail: "Elle sort de l'imprimante dans un instant",
        tone: "bg-accent text-on-accent",
      };
    default:
      return {
        chip: "En attente",
        detail:
          print.ahead === null ? "En attente de validation par l'équipe" : queueText(print.ahead),
        tone: "bg-background text-foreground",
      };
  }
}

/** Width of the print on a card: small, yet the band and its text show. */
const THUMB_WIDTH = "6rem";

/**
 * One print of the queue (SCRUM-69): the print as it will come out, then its
 * state. No page behind it; a tap on the print shows it full screen.
 */
function PrintCard({
  item,
  paused,
  onZoom,
}: {
  item: AlbumItem;
  paused: boolean;
  onZoom: () => void;
}) {
  const { chip, detail, tone } = describe(item);
  const ready = item.print!.status === "DONE";
  const waiting = item.print!.status === "PENDING";

  return (
    <li
      data-testid="print-card"
      className={`flex items-center gap-4 rounded-2xl bg-surface p-3 shadow-card ${
        ready ? "border-2 border-brand" : "border border-divider"
      }`}
    >
      <span className="shrink-0" style={{ width: THUMB_WIDTH }}>
        <PrintPreview
          src={item.thumbUrl}
          maxWidth={THUMB_WIDTH}
          frame={item.print!.frame}
          crop={item.crop}
          onOpen={item.thumbUrl ? onZoom : undefined}
          openLabel="Voir ce tirage en grand"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{chip}</span>
        <span role="status" aria-live="polite" className="text-sm text-muted">
          {detail}
        </span>
        {waiting && paused && (
          <span className="text-sm text-muted">Les impressions reprennent bientôt</span>
        )}
      </span>
    </li>
  );
}

/**
 * "Vos tirages" (SCRUM-53): every print the guest should hear about, with its
 * place in the queue. Opened from the home banner; kept fresh by the album
 * polling of the guest flow.
 */
export function Prints({
  items,
  offline,
  eventId,
  onBack,
  onTakePhoto,
}: {
  items: AlbumItem[];
  offline: boolean;
  eventId: string;
  onBack: () => void;
  onTakePhoto: () => void;
}) {
  const prints = useMemo(() => sortPrints(items.filter((item) => isActive(item))), [items]);
  const waiting = prints.some((item) => item.print!.status === "PENDING");
  const client = useMemo(() => createClient(), []);
  const [paused, setPaused] = useState(false);
  // The print shown full screen; the queue stays underneath, where it was.
  const [zoomed, setZoomed] = useState<string | null>(null);
  const zoomedItem = prints.find((item) => item.photoId === zoomed && item.thumbUrl);
  // Full screen deserves the full image; the thumbnail shows until it is signed.
  const [fullUrl, setFullUrl] = useState<{ photoId: string; url: string } | null>(null);
  const zoomedPath = zoomedItem?.fullPath;
  useEffect(() => {
    if (!zoomed || !zoomedPath) return;
    let active = true;
    signFullImage(client, zoomedPath).then(
      (url) => active && url && setFullUrl({ photoId: zoomed, url })
    );
    return () => {
      active = false;
    };
  }, [client, zoomed, zoomedPath]);

  // Assumption (to confirm with Germain): paused prints keep their place, with a word.
  useEffect(() => {
    if (!waiting) return;
    let active = true;
    client
      .rpc("get_print_availability", { p_event_id: eventId })
      .then(({ data }) => active && setPaused(data === "paused"));
    return () => {
      active = false;
    };
  }, [client, eventId, waiting, items]);

  return (
    <Screen
      stepKey="prints"
      back={{ label: "Accueil", onClick: onBack }}
      footer={
        prints.length > 0 ? (
          <Button variant="secondary" icon={<CameraIcon size={20} />} onClick={onTakePhoto}>
            Prendre une autre photo
          </Button>
        ) : (
          <Button icon={<CameraIcon size={20} />} onClick={onTakePhoto}>
            Prendre une photo
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.18em] text-muted">File d&apos;impression</span>
        <h1 className="text-2xl font-semibold text-accent">Vos tirages</h1>
        {prints.length > 0 && (
          <span data-testid="prints-summary" className="text-sm text-muted">
            {printsSummary(prints)}
          </span>
        )}
      </div>

      {/* The printer's state stays in sight (UX rule 1). */}
      <PrinterStatus eventId={eventId} />

      {prints.length > 0 ? (
        <ul className="flex flex-col gap-3" aria-label="Vos tirages">
          {prints.map((item) => (
            <PrintCard
              key={item.photoId}
              item={item}
              paused={paused}
              onZoom={() => setZoomed(item.photoId)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted">Aucun tirage en cours. Prenez une photo pour en lancer un.</p>
      )}

      {zoomedItem && (
        <PrintZoom
          src={fullUrl?.photoId === zoomedItem.photoId ? fullUrl.url : zoomedItem.thumbUrl!}
          frame={zoomedItem.print!.frame}
          crop={zoomedItem.crop}
          onClose={() => setZoomed(null)}
        />
      )}

      {offline && (
        <p role="status" className="text-sm text-muted">
          Mise à jour impossible pour le moment : voici le dernier état connu.
        </p>
      )}

      {prints.length > 0 && (
        <p className="rounded-xl bg-brand-soft p-4 text-sm text-on-brand">
          Vous pouvez fermer cette page : vos tirages restent suivis. Revenez ici pour savoir
          quand c&apos;est prêt.
        </p>
      )}
    </Screen>
  );
}

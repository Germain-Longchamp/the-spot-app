"use client";

import { useEffect, useMemo, useState } from "react";
import { Screen } from "@/components/guest/screen";
import { PrinterStatus } from "@/components/printer-status";
import { Button } from "@/components/ui/button";
import { CameraIcon, ChevronRightIcon, ImageIcon } from "@/components/ui/icons";
import {
  AlbumItem,
  isActive,
  printsSummary,
  queueText,
  sortPrints,
} from "@/lib/guest/album";
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

function PrintCard({
  item,
  paused,
  onOpen,
}: {
  item: AlbumItem;
  paused: boolean;
  onOpen: () => void;
}) {
  const { chip, detail, tone } = describe(item);
  const ready = item.print!.status === "DONE";
  const waiting = item.print!.status === "PENDING";

  return (
    <li>
      <button
        type="button"
        data-testid="print-card"
        onClick={onOpen}
        className={`flex w-full items-center gap-4 rounded-2xl bg-surface p-3 text-left shadow-card transition-transform active:scale-[0.98] ${
          ready ? "border-2 border-brand" : "border border-divider"
        }`}
      >
        <span className="w-16 shrink-0 rounded-sm bg-surface p-1 pb-4 shadow-card">
          {item.thumbUrl ? (
            // Signed, short-lived links: an image optimizer would cache them.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbUrl} alt="Votre photo" className="aspect-square w-full object-cover" />
          ) : (
            <span className="flex aspect-square w-full items-center justify-center bg-divider text-muted">
              <ImageIcon size={20} />
              <span className="sr-only">Photo indisponible</span>
            </span>
          )}
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
        <ChevronRightIcon size={20} className="shrink-0 text-muted" />
      </button>
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
  onOpen,
  onTakePhoto,
}: {
  items: AlbumItem[];
  offline: boolean;
  eventId: string;
  onBack: () => void;
  onOpen: (photoId: string) => void;
  onTakePhoto: () => void;
}) {
  const prints = useMemo(() => sortPrints(items.filter((item) => isActive(item))), [items]);
  const waiting = prints.some((item) => item.print!.status === "PENDING");
  const [paused, setPaused] = useState(false);
  const client = useMemo(() => createClient(), []);

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
              onOpen={() => onOpen(item.photoId)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted">Aucun tirage en cours. Prenez une photo pour en lancer un.</p>
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ICON_SIZE, IconTile } from "@/components/ui/icon-tile";
import { CheckIcon, ChevronRightIcon, PrinterIcon } from "@/components/ui/icons";
import { AlbumItem, isActive, loadAlbum, queueText } from "@/lib/guest/album";
import type { PrintJobStatus } from "@/lib/print/job-status";
import { createClient } from "@/lib/supabase/client";

/** Same pace as the print tracking: live enough, light on the salon network. */
export const ALBUM_POLL_INTERVAL_MS = 5_000;

/** Short labels for the badges; the detail shows the full sentence. */
export const printBadge: Record<PrintJobStatus | "NONE", { text: string; tone: string }> = {
  DONE: { text: "Prête à récupérer", tone: "bg-success text-surface" },
  STUCK: { text: "Un souci : voyez l'équipe", tone: "bg-danger text-surface" },
  FAILED: { text: "Un souci : voyez l'équipe", tone: "bg-danger text-surface" },
  PRINTING: { text: "Impression en cours", tone: "bg-accent text-on-accent" },
  PENDING: { text: "En attente de validation", tone: "bg-brand-soft text-on-brand" },
  CANCELLED: { text: "Annulée", tone: "bg-divider text-foreground" },
  NONE: { text: "Non imprimée", tone: "bg-surface text-foreground border border-border" },
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

/**
 * On the event home, under the two actions (SCRUM-57): where the guest's
 * prints stand, in two lines. A tap opens "Vos tirages" (SCRUM-53).
 * Problems first, then a print to collect, then the queue.
 */
export function PrintBanner({
  items,
  onOpen,
}: {
  items: AlbumItem[];
  onOpen: () => void;
}) {
  const active = items.filter((item) => isActive(item));
  if (!active.length) return null;
  const having = (...statuses: string[]) =>
    active.filter((item) => statuses.includes(item.print!.status));
  const problems = having("STUCK", "FAILED");
  const ready = having("DONE");
  const printing = having("PRINTING");
  // The guest's request closest to the printer.
  const positions = having("PENDING").flatMap((item) =>
    item.print!.ahead === null ? [] : [item.print!.ahead]
  );
  const nextAhead = positions.length ? Math.min(...positions) : null;
  const inQueue = printing.length + having("PENDING").length;

  let title: string;
  let detail: string;
  let tone = "bg-brand-soft text-on-brand";
  if (problems.length) {
    title = "Un souci avec votre impression";
    detail = "Rendez-vous auprès de l'équipe";
    tone = "bg-danger text-surface";
  } else if (ready.length) {
    title = ready.length > 1 ? `${ready.length} photos prêtes` : "Votre photo est prête";
    detail = "À récupérer près de l'imprimante";
    tone = "bg-brand text-on-brand";
  } else {
    title = inQueue > 1 ? `${inQueue} tirages dans la file` : "1 tirage dans la file";
    detail = printing.length
      ? "Votre photo est en cours d'impression"
      : nextAhead !== null
        ? queueText(nextAhead)
        : "En attente de validation par l'équipe";
  }

  return (
    <button
      type="button"
      data-testid="print-banner"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left transition-transform active:scale-[0.98] ${tone}`}
    >
      <IconTile tint="bg-surface/40">
        {ready.length && !problems.length ? <CheckIcon size={ICON_SIZE} /> : <PrinterIcon size={ICON_SIZE} />}
      </IconTile>
      <span role="status" aria-live="polite" className="flex flex-1 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[13px] opacity-90">{detail} · voir le suivi</span>
      </span>
      <ChevronRightIcon size={18} />
    </button>
  );
}

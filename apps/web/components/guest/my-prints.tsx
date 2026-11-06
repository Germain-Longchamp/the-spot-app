"use client";

import { useEffect, useState } from "react";
import { PrinterStatus } from "@/components/printer-status";
import { guestStatusLabel, PrintJobStatus } from "@/lib/print/job-status";
import { loadMyPrints, MyPrint, requestTime } from "@/lib/print/my-prints";
import { createClient } from "@/lib/supabase/client";

/** Often enough to feel live, light enough for 200 phones on a salon network. */
export const PRINT_POLL_INTERVAL_MS = 5_000;

const tone: Record<PrintJobStatus, string> = {
  PENDING: "text-foreground",
  PRINTING: "text-foreground",
  DONE: "text-success font-semibold",
  STUCK: "text-danger",
  FAILED: "text-danger",
  CANCELLED: "text-muted",
};

interface Props {
  eventId: string;
  /** Only this photo's requests, right after the guest asked to print it. */
  photoId?: string;
  /** Off where the print button already shows the printer's state. */
  showPrinterStatus?: boolean;
}

/**
 * Where the guest follows their prints. Hidden until there is one; the
 * printer's state always sits next to the requests (non-negotiable UX rule).
 */
export function MyPrints({ eventId, photoId, showPrinterStatus = true }: Props) {
  const [prints, setPrints] = useState<MyPrint[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    // The client retries a failed read for several seconds: never stack polls.
    let busy = false;

    async function refresh() {
      if (busy) return;
      busy = true;
      const result = await loadMyPrints(supabase, eventId);
      busy = false;
      if (!active) return;
      // A failed refresh keeps the last known state on screen, and says so.
      if (result === null) setOffline(true);
      else {
        setOffline(false);
        setPrints(result);
      }
    }

    refresh();
    const timer = setInterval(refresh, PRINT_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [eventId]);

  const shown = (prints ?? []).filter(
    (print) => !photoId || print.photoId === photoId
  );
  if (!shown.length) return null;

  return (
    <section
      aria-labelledby="my-prints-title"
      data-testid="my-prints"
      className="flex flex-col gap-3"
    >
      <h2 id="my-prints-title" className="text-lg font-semibold">
        {photoId ? "Suivi de votre impression" : "Vos impressions"}
      </h2>

      {showPrinterStatus && <PrinterStatus eventId={eventId} />}

      <ul className="flex flex-col gap-2">
        {shown.map((print) => (
          <li
            key={print.id}
            data-testid="print-request"
            className="rounded-lg border border-border bg-surface p-3"
          >
            <p className="text-sm text-muted">
              Demandée à {requestTime(print.createdAt)}
            </p>
            <p role="status" aria-live="polite" className={tone[print.status]}>
              {guestStatusLabel(print.status)}
            </p>
          </li>
        ))}
      </ul>

      {offline && (
        <p className="text-sm text-muted">
          Connexion perdue : voici le dernier état connu. La page se mettra à
          jour toute seule dès le retour du réseau.
        </p>
      )}
    </section>
  );
}

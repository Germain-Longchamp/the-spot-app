"use client";

import { PrinterStatus } from "@/components/printer-status";
import { Button } from "@/components/ui/button";
import { PrinterIcon } from "@/components/ui/icons";
import { printRequestMessages } from "@/lib/print/request-print";
import { usePrintRequest } from "@/lib/print/use-print-request";

interface Props {
  photoId: string;
  eventId: string;
  /** Why printing is impossible for now, if it is. */
  unavailable?: string | null;
  /** Runs first: the print only starts if it returns true. */
  beforePrint?: () => Promise<boolean>;
  onCreated?: () => void;
}

/** The print button on its own, with the printer's state above it. */
export function PrintButton({
  photoId,
  eventId,
  unavailable = null,
  beforePrint,
  onCreated,
}: Props) {
  const { press, sending, outcome, finished } = usePrintRequest(photoId);

  async function handlePress() {
    if ((await press(beforePrint)) === "created") onCreated?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <PrinterStatus eventId={eventId} />
      <Button
        icon={<PrinterIcon size={20} />}
        onClick={handlePress}
        disabled={sending || finished || unavailable !== null}
      >
        Imprimer
      </Button>
      <p role="status" aria-live="polite">
        {sending
          ? "Envoi de votre demande…"
          : (outcome && printRequestMessages[outcome]) ?? unavailable}
      </p>
    </div>
  );
}

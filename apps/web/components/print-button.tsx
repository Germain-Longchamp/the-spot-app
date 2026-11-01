"use client";

import { useRef, useState } from "react";
import { PrinterStatus } from "@/components/printer-status";
import { createClient } from "@/lib/supabase/client";
import {
  canRetry,
  printRequestMessages,
  PrintRequestOutcome,
  requestPrint,
} from "@/lib/print/request-print";

/**
 * One key per photo, kept across reloads: a guest who reloads after losing
 * the network must replay the same request, not create a second print.
 */
function idempotencyKeyFor(photoId: string): string {
  const storageKey = `print-request:${photoId}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

export function PrintButton({
  photoId,
  eventId,
}: {
  photoId: string;
  eventId: string;
}) {
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<PrintRequestOutcome | null>(null);
  // A ref, not state: a double tap fires before React re-renders the button.
  const inFlight = useRef(false);
  const key = useRef<string | null>(null);

  async function handlePress() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    key.current ??= idempotencyKeyFor(photoId);

    const result = await requestPrint(createClient(), photoId, key.current);

    setOutcome(result);
    setSending(false);
    inFlight.current = false;
  }

  const finished = outcome !== null && !canRetry(outcome);

  return (
    <div className="flex flex-col gap-3">
      <PrinterStatus eventId={eventId} />
      <button
        type="button"
        onClick={handlePress}
        disabled={sending || finished}
        className="min-h-12 rounded-lg bg-amber-500 px-6 font-semibold text-black disabled:opacity-50"
      >
        Imprimer
      </button>
      <p role="status" aria-live="polite">
        {sending
          ? "Envoi de votre demande…"
          : outcome && printRequestMessages[outcome]}
      </p>
    </div>
  );
}

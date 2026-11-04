"use client";

import { useRef, useState } from "react";
import { PrinterStatus } from "@/components/printer-status";
import { Button } from "@/components/ui/button";
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
const storageKeyFor = (photoId: string) => `print-request:${photoId}`;

function forgetKey(photoId: string) {
  try {
    sessionStorage.removeItem(storageKeyFor(photoId));
  } catch {
    // Nothing was stored, so there is nothing to forget.
  }
}

function idempotencyKeyFor(photoId: string): string {
  const storageKey = storageKeyFor(photoId);
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

interface Props {
  photoId: string;
  eventId: string;
  /** Why printing is impossible for now, if it is. */
  unavailable?: string | null;
  /** Runs first: the print only starts if it returns true. */
  beforePrint?: () => Promise<boolean>;
  onCreated?: () => void;
}

export function PrintButton({
  photoId,
  eventId,
  unavailable = null,
  beforePrint,
  onCreated,
}: Props) {
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<PrintRequestOutcome | null>(null);
  // A ref, not state: a double tap fires before React re-renders the button.
  const inFlight = useRef(false);
  const key = useRef<string | null>(null);

  async function handlePress() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);

    if (beforePrint && !(await beforePrint())) {
      setSending(false);
      inFlight.current = false;
      return;
    }

    key.current ??= idempotencyKeyFor(photoId);

    const result = await requestPrint(createClient(), photoId, key.current);

    // That request is over: asking again must be a new one.
    if (result === "request_cancelled") {
      key.current = null;
      forgetKey(photoId);
    }

    if (result === "created") onCreated?.();

    setOutcome(result);
    setSending(false);
    inFlight.current = false;
  }

  const finished = outcome !== null && !canRetry(outcome);

  return (
    <div className="flex flex-col gap-3">
      <PrinterStatus eventId={eventId} />
      <Button
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

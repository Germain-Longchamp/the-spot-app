"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  canRetry,
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

/**
 * Asks for one print of one photo. Safe against double taps and reloads:
 * whatever happens, the server sees one request for this photo.
 */
export function usePrintRequest(photoId: string) {
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<PrintRequestOutcome | null>(null);
  // A ref, not state: a double tap fires before React re-renders the button.
  const inFlight = useRef(false);
  const key = useRef<string | null>(null);

  /** Runs `before` first (the photo upload): no print without it. */
  async function press(before?: () => Promise<boolean>): Promise<PrintRequestOutcome | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setSending(true);

    if (before && !(await before())) {
      setSending(false);
      inFlight.current = false;
      return null;
    }

    key.current ??= idempotencyKeyFor(photoId);
    const result = await requestPrint(createClient(), photoId, key.current);

    // That request is over: asking again must be a new one.
    if (result === "request_cancelled") {
      key.current = null;
      forgetKey(photoId);
    }

    setOutcome(result);
    setSending(false);
    inFlight.current = false;
    return result;
  }

  const finished = outcome !== null && !canRetry(outcome);
  return { press, sending, outcome, finished };
}

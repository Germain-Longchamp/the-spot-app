"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type State = "checking" | "online" | "offline" | "unknown";

const POLL_INTERVAL_MS = 10_000;

/** A failed check says something about the phone's network, not the printer. */
const FAILURES_BEFORE_UNKNOWN = 3;

const display: Record<State, { text: string; dot: string }> = {
  checking: { text: "Vérification de l'imprimante…", dot: "bg-muted" },
  online: { text: "L'imprimante est connectée", dot: "bg-success" },
  offline: {
    text: "L'imprimante n'est pas connectée pour le moment",
    dot: "bg-danger",
  },
  unknown: {
    text: "Impossible de vérifier l'imprimante pour le moment",
    dot: "bg-danger",
  },
};

export function PrinterStatusView({ state, compact = false }: { state: State; compact?: boolean }) {
  const { text, dot } = display[state];

  return (
    <p
      data-testid="printer-status"
      data-state={state}
      aria-live="polite"
      className={
        compact
          ? // In a header, beside the way back: smaller, and on two lines if
            // the screen is narrow; the same words (SCRUM-66).
            "inline-flex min-w-0 items-center gap-2 rounded-2xl bg-surface px-3 py-1.5 text-xs leading-tight shadow-card"
          : "inline-flex items-center gap-2 self-start rounded-full bg-surface px-3 py-1.5 text-sm shadow-card"
      }
    >
      <span
        aria-hidden="true"
        className={`size-2.5 shrink-0 rounded-full ${dot} ${state === "checking" ? "animate-soft-pulse" : ""}`}
      />
      {text}
    </p>
  );
}

export function PrinterStatus({ eventId, compact = false }: { eventId: string; compact?: boolean }) {
  const [state, setState] = useState<State>("checking");
  const failures = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function check() {
      const { data, error } = await supabase.rpc("get_printer_status", {
        p_event_id: eventId,
      });
      if (!active) return;

      if (error) {
        failures.current += 1;
        if (failures.current >= FAILURES_BEFORE_UNKNOWN) setState("unknown");
        return;
      }
      failures.current = 0;
      setState(data ? "online" : "offline");
    }

    check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [eventId]);

  return <PrinterStatusView state={state} compact={compact} />;
}

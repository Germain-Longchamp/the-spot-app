"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type State = "checking" | "online" | "offline" | "unknown";

const POLL_INTERVAL_MS = 10_000;

/** A failed check says something about the phone's network, not the printer. */
const FAILURES_BEFORE_UNKNOWN = 3;

const display: Record<State, { text: string; dot: string }> = {
  checking: { text: "Vérification de l'imprimante…", dot: "bg-gray-400" },
  online: { text: "L'imprimante est connectée", dot: "bg-teal-500" },
  offline: {
    text: "L'imprimante n'est pas connectée pour le moment",
    dot: "bg-red-600",
  },
  unknown: {
    text: "Impossible de vérifier l'imprimante pour le moment",
    dot: "bg-red-600",
  },
};

export function PrinterStatus({ eventId }: { eventId: string }) {
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

  const { text, dot } = display[state];

  return (
    <p
      data-testid="printer-status"
      data-state={state}
      aria-live="polite"
      className="flex items-center gap-2 text-sm"
    >
      <span aria-hidden="true" className={`size-3 rounded-full ${dot}`} />
      {text}
    </p>
  );
}

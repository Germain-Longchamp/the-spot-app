import { MAX_REPORTS_PER_PAGE, sanitize } from "@/lib/errors/sanitize";
import { createClient } from "@/lib/supabase/client";

export { MAX_REPORTS_PER_PAGE, sanitize };

let sent = 0;
let currentEventId: string | null = null;

/** Set once the guest is in, so errors can be grouped by event. */
export function setErrorEvent(eventId: string | null) {
  currentEventId = eventId;
}

/** The screen without its secret: "/e/[lien]/galerie". */
export function currentScreen(): string {
  return sanitize(window.location.pathname);
}

/**
 * Sends one error to the shared log. Never throws and never blocks the
 * guest: if the network is down, the error is simply lost.
 */
export async function reportError(message: string): Promise<void> {
  if (sent >= MAX_REPORTS_PER_PAGE) return;
  sent += 1;
  try {
    await createClient().rpc("log_app_error", {
      p_event_id: currentEventId,
      p_screen: currentScreen(),
      p_browser: navigator.userAgent.slice(0, 300),
      p_message: sanitize(message),
    });
  } catch {
    // Reporting must never become a second error.
  }
}

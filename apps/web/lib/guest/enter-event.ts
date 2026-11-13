import type { SupabaseClient } from "@supabase/supabase-js";
import { reportError, setErrorEvent } from "@/lib/errors/report";

export interface GuestEvent {
  id: string;
  name: string;
  /** "2027-01-21", or null when the organizer gave none. */
  eventDate: string | null;
  /** The event has a gallery: guests may choose to publish. */
  galleryEnabled: boolean;
  /** The gallery is open: guests may look at it. */
  galleryVisible: boolean;
  /** Line 1 of the print's band: the organiser's text, or the name (SCRUM-62). */
  frameTitle: string;
}

export type EntryOutcome =
  | { kind: "joined"; event: GuestEvent; guestId: string }
  | { kind: "invalid" | "closed" | "connection_lost" | "storage_blocked" };

/** Reuses the session of this browser: a second scan is the same guest. */
async function ensureSession(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    // Seen on 2026-11-04: anonymous sign-ins switched off in Supabase looked
    // like a network problem to everybody. The code tells them apart.
    reportError(`Connexion anonyme refusée : ${error.code ?? error.status ?? error.message}`);
  }
  return !error;
}

export async function enterEvent(
  supabase: SupabaseClient,
  token: string
): Promise<EntryOutcome> {
  if (!navigator.cookieEnabled) return { kind: "storage_blocked" };

  try {
    const entry = await supabase.rpc("get_event_entry", { p_token: token });
    if (entry.error) return { kind: "connection_lost" };
    if (entry.data === "invalid") return { kind: "invalid" };
    if (entry.data === "closed") return { kind: "closed" };

    if (!(await ensureSession(supabase))) return { kind: "connection_lost" };

    const { data, error } = await supabase.rpc("join_event", {
      p_token: token,
    });
    if (error) return { kind: "connection_lost" };
    if (data?.result === "closed") return { kind: "closed" };
    if (data?.result !== "joined") return { kind: "invalid" };

    setErrorEvent(data.event.id);
    return {
      kind: "joined",
      guestId: data.guest_id,
      event: {
        id: data.event.id,
        name: data.event.name,
        eventDate: data.event.event_date ?? null,
        galleryEnabled: data.event.gallery_enabled ?? false,
        galleryVisible: data.event.gallery_visible,
        frameTitle: data.event.frame_title || data.event.name,
      },
    };
  } catch {
    return { kind: "connection_lost" };
  }
}

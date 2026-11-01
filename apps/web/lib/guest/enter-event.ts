import type { SupabaseClient } from "@supabase/supabase-js";

export interface GuestEvent {
  id: string;
  name: string;
  galleryVisible: boolean;
}

export type EntryOutcome =
  | { kind: "joined"; event: GuestEvent; guestId: string }
  | { kind: "invalid" | "closed" | "connection_lost" | "storage_blocked" };

/** Reuses the session of this browser: a second scan is the same guest. */
async function ensureSession(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  const { error } = await supabase.auth.signInAnonymously();
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

    return {
      kind: "joined",
      guestId: data.guest_id,
      event: {
        id: data.event.id,
        name: data.event.name,
        galleryVisible: data.event.gallery_visible,
      },
    };
  } catch {
    return { kind: "connection_lost" };
  }
}

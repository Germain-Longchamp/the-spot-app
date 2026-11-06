import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrintJobStatus } from "@/lib/print/job-status";

export interface MyPrint {
  id: string;
  photoId: string;
  status: PrintJobStatus;
  createdAt: string;
}

/**
 * The guest's own print requests in this event, newest first. RLS limits the
 * rows to this browser's identity. Returns null when the network fails, so the
 * screen can keep the last known state.
 */
export async function loadMyPrints(
  supabase: SupabaseClient,
  eventId: string
): Promise<MyPrint[] | null> {
  try {
    const { data, error } = await supabase
      .from("print_jobs")
      .select("id, photo_id, status, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (error) return null;
    return data.map((row) => ({
      id: row.id,
      photoId: row.photo_id,
      status: row.status,
      createdAt: row.created_at,
    }));
  } catch {
    return null;
  }
}

/** "14 h 32", the way a guest reads the time. */
export function requestTime(iso: string): string {
  const date = new Date(iso);
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${date.getHours()} h ${minutes}`;
}

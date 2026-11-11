import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrintJobStatus } from "@/lib/print/job-status";

export interface AlbumItem {
  photoId: string;
  thumbUrl: string | null;
  /** Full image path, signed only when the guest opens the photo. */
  fullPath: string;
  published: boolean;
  createdAt: string;
  /** The latest print request for this photo, if any. */
  print: AlbumPrint | null;
}

export interface AlbumPrint {
  status: PrintJobStatus;
  createdAt: string;
  /**
   * Waiting requests of the event before this one (SCRUM-53), for a request
   * still waiting; null otherwise, or when the count could not be read.
   */
  ahead: number | null;
}

/** Long enough to browse, short enough to be useless if copied. */
const LINK_LIFETIME_S = 60 * 60;

/** What needs the guest first: ready to collect, a problem, then the queue. */
const rank = (item: AlbumItem): number => {
  switch (item.print?.status) {
    case "DONE":
      return 0;
    case "STUCK":
    case "FAILED":
      return 1;
    case "PRINTING":
      return 2;
    case "PENDING":
      return 3;
    default:
      return 4;
  }
};

/** "2 photos avant la vôtre", or "C'est la prochaine" (UX rule 2). */
export function queueText(ahead: number): string {
  if (ahead <= 0) return "C'est la prochaine";
  return ahead === 1 ? "1 photo avant la vôtre" : `${ahead} photos avant la vôtre`;
}

/** "1 prêt · 2 en attente": what the guest's prints are doing, in one line. */
export function printsSummary(items: AlbumItem[]): string {
  const count = (statuses: PrintJobStatus[]) =>
    items.filter((item) => item.print && statuses.includes(item.print.status)).length;
  const ready = count(["DONE"]);
  const problems = count(["STUCK", "FAILED"]);
  const printing = count(["PRINTING"]);
  const waiting = count(["PENDING"]);
  return [
    ready && `${ready} ${ready > 1 ? "prêts" : "prêt"}`,
    problems && `${problems} ${problems > 1 ? "soucis" : "souci"}`,
    printing && `${printing} en cours`,
    waiting && `${waiting} en attente`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The prints page order: ready, problem, printing, then the queue in its order. */
export function sortPrints(items: AlbumItem[]): AlbumItem[] {
  return [...items].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.print?.status === "PENDING"
        ? a.print.createdAt.localeCompare(b.print!.createdAt)
        : b.print!.createdAt.localeCompare(a.print!.createdAt))
  );
}

export function sortAlbum(items: AlbumItem[]): AlbumItem[] {
  return [...items].sort(
    (a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt)
  );
}

/** A photo can be printed if it never was, or its last request was cancelled. */
export function canPrint(item: AlbumItem): boolean {
  return item.print === null || item.print.status === "CANCELLED";
}

/** Requests the guest should hear about now, on the event home. */
export function isActive(item: AlbumItem, now = Date.now()): boolean {
  const status = item.print?.status;
  if (!status) return false;
  if (status === "PENDING" || status === "PRINTING" || status === "STUCK" || status === "FAILED") {
    return true;
  }
  // A print stays "ready" forever in the database; on the home banner it
  // fades after half an hour (assumption: collected by then).
  return status === "DONE" && now - Date.parse(item.print!.createdAt) < 30 * 60_000;
}

/**
 * The guest's own photos in this event, each with its latest print request.
 * The guest filter matters: once the gallery opens, RLS also lets a guest read
 * the photos other guests published, and those must not show up here.
 * Returns null when the network fails, so the screen keeps its last state.
 */
export async function loadAlbum(
  supabase: SupabaseClient,
  eventId: string,
  guestId: string
): Promise<AlbumItem[] | null> {
  try {
    const [photos, prints] = await Promise.all([
      supabase
        .from("photos")
        .select("id, storage_path, thumb_path, is_published, created_at")
        .eq("event_id", eventId)
        .eq("guest_id", guestId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("print_jobs")
        .select("photo_id, status, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false }),
    ]);
    if (photos.error || prints.error) return null;

    // Newest first, so the first request seen for a photo is its latest.
    const latest = new Map<string, AlbumPrint>();
    for (const job of prints.data) {
      if (!latest.has(job.photo_id)) {
        latest.set(job.photo_id, { status: job.status, createdAt: job.created_at, ahead: null });
      }
    }

    // The place in the queue, only when something waits. Unread, the cards
    // fall back to "waiting for the team": never a reason to lose the album.
    if (Array.from(latest.values()).some((print) => print.status === "PENDING")) {
      const { data, error } = await supabase.rpc("guest_queue_positions", {
        p_event_id: eventId,
      });
      if (!error && Array.isArray(data)) {
        for (const row of data as { photo_id: string; ahead: number }[]) {
          const print = latest.get(row.photo_id);
          if (print?.status === "PENDING") print.ahead = row.ahead;
        }
      }
    }

    const paths = photos.data.map((row) => row.thumb_path ?? row.storage_path);
    let urls = new Map<string, string>();
    if (paths.length) {
      const { data } = await supabase.storage
        .from("photos")
        .createSignedUrls(paths, LINK_LIFETIME_S);
      urls = new Map(
        (data ?? []).flatMap((link) =>
          link.path && link.signedUrl ? [[link.path, link.signedUrl] as const] : []
        )
      );
    }

    return sortAlbum(
      photos.data.map((row) => ({
        photoId: row.id,
        thumbUrl: urls.get(row.thumb_path ?? row.storage_path) ?? null,
        fullPath: row.storage_path,
        published: row.is_published,
        createdAt: row.created_at,
        print: latest.get(row.id) ?? null,
      }))
    );
  } catch {
    return null;
  }
}

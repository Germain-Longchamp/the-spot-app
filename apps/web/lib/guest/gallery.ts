import type { SupabaseClient } from "@supabase/supabase-js";

export interface GalleryPhoto {
  id: string;
  /** Light image for the grid. */
  thumbUrl: string;
  /** Path of the full image, signed only when the guest opens it. */
  fullPath: string;
  /** Taken by this guest. */
  mine: boolean;
  /** In the event gallery; false for a photo the guest kept for themselves. */
  shared: boolean;
  createdAt: string;
}

/** One row of the gallery view, before its thumbnail link is signed. */
export interface GalleryRow {
  id: string;
  storage_path: string;
  thumb_path: string | null;
  is_published: boolean;
  is_mine: boolean;
  created_at: string;
}

/** Enough to fill a phone screen twice, small enough for a slow network. */
export const GALLERY_PAGE_SIZE = 24;

/** Long enough to browse, short enough to be useless if copied. */
const LINK_LIFETIME_S = 60 * 60;

/**
 * The newest rows of the gallery, from `from` to `to` included (SCRUM-63):
 * the photos other guests shared when the gallery is open, and all of this
 * guest's own photos, shared or not. RLS decides every row, the view only adds
 * `is_mine`, so no guest id ever reaches the phone. Null when the network fails.
 */
export async function loadGalleryRows(
  supabase: SupabaseClient,
  eventId: string,
  from: number,
  to: number
): Promise<GalleryRow[] | null> {
  try {
    const { data, error } = await supabase
      .from("gallery_photos")
      .select("id, storage_path, thumb_path, is_published, is_mine, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .range(from, to);
    return error ? null : (data as GalleryRow[]);
  } catch {
    return null;
  }
}

/** Signs the thumbnails; a photo whose file is gone is left out. */
export async function toGalleryPhotos(
  supabase: SupabaseClient,
  rows: GalleryRow[]
): Promise<GalleryPhoto[] | null> {
  if (!rows.length) return [];
  try {
    const urls = await signPaths(
      supabase,
      rows.map((row) => row.thumb_path ?? row.storage_path)
    );
    if (!urls) return null;
    return rows.flatMap((row) => {
      const thumbUrl = urls.get(row.thumb_path ?? row.storage_path);
      return thumbUrl
        ? [
            {
              id: row.id,
              thumbUrl,
              fullPath: row.storage_path,
              mine: row.is_mine,
              shared: row.is_published,
              createdAt: row.created_at,
            },
          ]
        : [];
    });
  } catch {
    return null;
  }
}

/** One page of the gallery, newest first. Null when the network fails. */
export async function loadGalleryPage(
  supabase: SupabaseClient,
  eventId: string,
  page: number
): Promise<{ photos: GalleryPhoto[]; more: boolean } | null> {
  const from = page * GALLERY_PAGE_SIZE;
  const rows = await loadGalleryRows(supabase, eventId, from, from + GALLERY_PAGE_SIZE - 1);
  if (!rows) return null;
  const photos = await toGalleryPhotos(supabase, rows);
  if (!photos) return null;
  return { photos, more: rows.length === GALLERY_PAGE_SIZE };
}

export async function signFullImage(
  supabase: SupabaseClient,
  path: string
): Promise<string | null> {
  const urls = await signPaths(supabase, [path]);
  return urls?.get(path) ?? null;
}

async function signPaths(supabase: SupabaseClient, paths: string[]) {
  const { data, error } = await supabase.storage
    .from("photos")
    .createSignedUrls(paths, LINK_LIFETIME_S);
  if (error) return null;
  return new Map(
    data.flatMap((link) =>
      link.path && link.signedUrl ? [[link.path, link.signedUrl] as const] : []
    )
  );
}

/**
 * How many photos wait behind the home's gallery entry (SCRUM-57): the shared
 * ones while the gallery is open, otherwise the guest's own; "all" is what the
 * gallery shows (SCRUM-54). A count only, no row sent. Null when the network fails: the entry then shows no number.
 */
export async function countGalleryPhotos(
  supabase: SupabaseClient,
  eventId: string,
  scope: "shared" | "mine" | "all"
): Promise<number | null> {
  try {
    let query = supabase
      .from("gallery_photos")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);
    if (scope !== "all") query = query.eq(scope === "shared" ? "is_published" : "is_mine", true);
    const { count, error } = await query;
    return error ? null : count;
  } catch {
    return null;
  }
}

/** "24 photos partagées", "1 de vos photos": the line under the gallery entry. */
export function galleryCountText(count: number, scope: "shared" | "mine"): string {
  if (scope === "shared") {
    if (count === 0) return "Aucune photo pour l'instant";
    return count === 1 ? "1 photo partagée" : `${count} photos partagées`;
  }
  if (count === 0) return "Aucune photo pour l'instant";
  return count === 1 ? "1 de vos photos" : `${count} de vos photos`;
}

/** How often an open gallery looks for new photos (SCRUM-54). */
export const GALLERY_POLL_INTERVAL_MS = 10_000;

/**
 * Compares what the guest sees with the newest rows read again (SCRUM-54).
 * `rows` must start at the newest photo and cover at least as many rows as
 * shown. Returns the photos still there (with their shared state updated) and
 * the rows newer than everything shown.
 */
export function diffGallery(
  shown: GalleryPhoto[],
  rows: GalleryRow[],
  requested: number
): { kept: GalleryPhoto[]; fresh: GalleryRow[] } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Every photo shown was in reach of the read, unless the read came back full
  // and the photo is older than its last row: then nothing is known about it.
  const complete = rows.length < requested;
  const oldest = rows[rows.length - 1]?.created_at;
  const kept = shown.flatMap((photo) => {
    const row = byId.get(photo.id);
    if (row) return [{ ...photo, mine: row.is_mine, shared: row.is_published }];
    const outOfReach = !complete && oldest !== undefined && photo.createdAt < oldest;
    return outOfReach ? [photo] : [];
  });
  const shownIds = new Set(shown.map((photo) => photo.id));
  const newest = shown[0]?.createdAt;
  const fresh = rows.filter(
    (row) => !shownIds.has(row.id) && (newest === undefined || row.created_at > newest)
  );
  return { kept, fresh };
}

/** "3 nouvelles photos", on the pill above the grid. */
export function newPhotosText(count: number): string {
  return count === 1 ? "1 nouvelle photo" : `${count} nouvelles photos`;
}

/** "/e/<token>#photo": the home opens straight on the camera (SCRUM-54). */
export const TAKE_PHOTO_HASH = "photo";

/**
 * The gallery settings of the guest's event, read again while the gallery is
 * on screen (SCRUM-56): the team may open it at any time. RLS limits the read
 * to the guest's own event. Null when the network fails: the screen stays.
 */
export async function loadGalleryState(
  supabase: SupabaseClient,
  eventId: string
): Promise<{ enabled: boolean; visible: boolean } | null> {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("gallery_enabled, gallery_visible")
      .eq("id", eventId)
      .maybeSingle();
    if (error || !data) return null;
    return { enabled: data.gallery_enabled, visible: data.gallery_visible };
  } catch {
    return null;
  }
}

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
}

/** Enough to fill a phone screen twice, small enough for a slow network. */
export const GALLERY_PAGE_SIZE = 24;

/** Long enough to browse, short enough to be useless if copied. */
const LINK_LIFETIME_S = 60 * 60;

/**
 * One page of the gallery, newest first (SCRUM-63): the photos other guests
 * shared when the gallery is open, and all of this guest's own photos, shared
 * or not. RLS decides every row, the view only adds `is_mine`, so no guest id
 * ever reaches the phone. Returns null when the network fails.
 */
export async function loadGalleryPage(
  supabase: SupabaseClient,
  eventId: string,
  page: number
): Promise<{ photos: GalleryPhoto[]; more: boolean } | null> {
  try {
    const from = page * GALLERY_PAGE_SIZE;
    const { data: rows, error } = await supabase
      .from("gallery_photos")
      .select("id, storage_path, thumb_path, is_published, is_mine")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .range(from, from + GALLERY_PAGE_SIZE - 1);
    if (error) return null;
    if (!rows.length) return { photos: [], more: false };

    const paths = rows.map((row) => row.thumb_path ?? row.storage_path);
    const urls = await signPaths(supabase, paths);
    if (!urls) return null;

    return {
      photos: rows.flatMap((row) => {
        const thumbUrl = urls.get(row.thumb_path ?? row.storage_path);
        return thumbUrl
          ? [
              {
                id: row.id,
                thumbUrl,
                fullPath: row.storage_path,
                mine: row.is_mine,
                shared: row.is_published,
              },
            ]
          : [];
      }),
      more: rows.length === GALLERY_PAGE_SIZE,
    };
  } catch {
    return null;
  }
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

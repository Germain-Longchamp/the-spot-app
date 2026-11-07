import type { SupabaseClient } from "@supabase/supabase-js";

export interface MyPhoto {
  id: string;
  url: string;
}

/** Long enough to look at the page, short enough to be useless if copied. */
const LINK_LIFETIME_S = 60 * 60;

/**
 * The guest's own photos in this event, newest first. RLS limits the rows and
 * the files to this browser's identity; nothing here can reach someone else's.
 * Returns null when the network fails, so the page can stay quiet about it.
 */
export async function loadMyPhotos(
  supabase: SupabaseClient,
  eventId: string
): Promise<MyPhoto[] | null> {
  try {
    const { data: rows, error } = await supabase
      .from("photos")
      .select("id, storage_path")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return null;
    if (!rows.length) return [];

    const { data: links, error: linkError } = await supabase.storage
      .from("photos")
      .createSignedUrls(
        rows.map((row) => row.storage_path),
        LINK_LIFETIME_S
      );
    if (linkError) return null;

    const urlByPath = new Map(
      links.flatMap((link) =>
        link.path && link.signedUrl ? [[link.path, link.signedUrl]] : []
      )
    );
    return rows.flatMap((row) => {
      const url = urlByPath.get(row.storage_path);
      return url ? [{ id: row.id, url }] : [];
    });
  } catch {
    return null;
  }
}

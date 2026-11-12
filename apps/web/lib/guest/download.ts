import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Saving a gallery photo on the phone (SCRUM-59). Any guest may save any photo
 * of the open gallery (Germain, 2026-11-11); RLS on the files decides, as for
 * showing them: shared photos of an open gallery, and the guest's own.
 */

/** A minute: enough to start the download, useless if the link is copied. */
export const DOWNLOAD_LINK_LIFETIME_S = 60;

/** "Salon démo", 2027-01-14, 7th photo → "salon-demo-2027-01-14-7.jpg". */
export function downloadName(eventName: string, eventDate: string | null, n: number): string {
  const slug =
    eventName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "photo";
  const date = eventDate?.slice(0, 10);
  return [slug, date, String(n)].filter(Boolean).join("-") + ".jpg";
}

export type DownloadLink = { url: string } | { error: "gone" | "network" };

/**
 * A short-lived link that makes the browser save the file under `fileName`
 * (Content-Disposition). Refused by RLS, or the file is gone: "gone".
 */
export async function signDownload(
  supabase: SupabaseClient,
  path: string,
  fileName: string
): Promise<DownloadLink> {
  try {
    const { data, error } = await supabase.storage
      .from("photos")
      .createSignedUrl(path, DOWNLOAD_LINK_LIFETIME_S, { download: fileName });
    if (data?.signedUrl) return { url: data.signedUrl };
    // An answer from Storage means the file is not there for this guest; no
    // answer at all is the network.
    return { error: error?.name === "StorageApiError" ? "gone" : "network" };
  } catch {
    return { error: "network" };
  }
}

/**
 * Instagram, Facebook and similar apps open links in their own browser, which
 * often ignores downloads: the guest is told to press the photo instead.
 */
export function isInAppBrowser(userAgent: string): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|TikTok/i.test(userAgent);
}

/** The phone can hand a file to its share sheet ("Enregistrer l'image"). */
export function canShareFiles(): boolean {
  try {
    return (
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File([""], "photo.jpg", { type: "image/jpeg" })] })
    );
  } catch {
    return false;
  }
}

export const downloadMessages = {
  gone: "Cette photo n'est plus disponible.",
  network: "Téléchargement impossible pour le moment, réessayez.",
  inApp: "Si rien ne se passe, appuyez longuement sur la photo pour l'enregistrer.",
} as const;

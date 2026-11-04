import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { targetSize } from "@/lib/guest/photo-size";

/** Provisional: the real value depends on the printer's paper (SCRUM-26). */
const JPEG_QUALITY = 0.85;

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
const UPLOAD_TIMEOUT_MS = 60_000;

export async function compressPhoto(photo: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(photo);
  const { width, height } = targetSize(bitmap.width, bitmap.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("compression"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

/** Upload with progress, which supabase-js and fetch cannot report. */
function uploadFile(
  path: string,
  file: Blob,
  accessToken: string,
  onProgress: (ratio: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/photos/${path}`
    );
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Content-Type", "image/jpeg");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      // A retry after a lost answer finds the file already there.
      const alreadyThere =
        xhr.status === 409 || /duplicate/i.test(xhr.responseText);
      if ((xhr.status >= 200 && xhr.status < 300) || alreadyThere) resolve();
      else reject(new Error(`upload ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("réseau"));
    xhr.ontimeout = () => reject(new Error("délai"));
    xhr.send(file);
  });
}

interface SendOptions {
  supabase: SupabaseClient;
  photo: Blob;
  photoId: string;
  eventId: string;
  guestId: string;
  published: boolean;
  onProgress: (ratio: number) => void;
  /** Tells the guest a retry is under way, when the network struggles. */
  onRetry?: () => void;
}

export type SendResult = "sent" | "failed" | "event_closed";

/**
 * Safe to call again after a failure: the photo id is fixed by the caller, so
 * the file path and the database row can only ever exist once.
 */
export async function sendPhoto(options: SendOptions): Promise<SendResult> {
  const { supabase, photo, photoId, eventId, guestId } = options;
  const path = `${eventId}/${guestId}/${photoId}.jpg`;

  let compressed: Blob;
  try {
    compressed = await compressPhoto(photo);
  } catch {
    return "failed";
  }

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      options.onRetry?.();
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1])
      );
    }
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return "failed";

      await uploadFile(
        path,
        compressed,
        data.session.access_token,
        options.onProgress
      );

      const { data: registered, error } = await supabase.rpc("register_photo", {
        p_photo_id: photoId,
        p_event_id: eventId,
        p_published: options.published,
      });
      if (error) continue;
      if (registered?.result === "event_closed") return "event_closed";
      return registered?.result === "created" ? "sent" : "failed";
    } catch {
      // Lost connection: the next attempt starts over, safely.
    }
  }
  return "failed";
}

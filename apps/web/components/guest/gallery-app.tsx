"use client";

import { Gallery } from "@/components/guest/gallery";
import { GuestApp } from "@/components/guest/guest-app";

/** Same entry as the event home (same session, same messages), then the gallery. */
export function GalleryApp({ token }: { token: string }) {
  return (
    <GuestApp token={token}>
      {(event, guestId) => <Gallery event={event} token={token} guestId={guestId} />}
    </GuestApp>
  );
}

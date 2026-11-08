"use client";

import { useEffect, useState } from "react";
import { loadMyPhotos, MyPhoto } from "@/lib/guest/my-photos";
import { createClient } from "@/lib/supabase/client";

/** Hidden until the guest has sent a photo: nothing to show, nothing to explain. */
export function MyPhotos({ eventId }: { eventId: string }) {
  const [photos, setPhotos] = useState<MyPhoto[]>([]);

  useEffect(() => {
    let active = true;
    loadMyPhotos(createClient(), eventId).then((result) => {
      // A network failure keeps the page usable: the section simply stays hidden.
      if (active && result) setPhotos(result);
    });
    return () => {
      active = false;
    };
  }, [eventId]);

  if (!photos.length) return null;

  return (
    <section aria-labelledby="my-photos-title" className="flex flex-col gap-3">
      <h2 id="my-photos-title" className="text-lg font-semibold">
        Vos photos
      </h2>
      <ul className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <li key={photo.id}>
            {/* Signed, short-lived links: an image optimizer would cache them. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt="Une de vos photos"
              loading="lazy"
              className="aspect-square w-full rounded-xl object-cover shadow-card"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

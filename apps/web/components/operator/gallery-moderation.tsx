"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OperatorAction } from "@/lib/operator/actions";
import type { GalleryItem } from "@/lib/operator/panel";

interface Props {
  photos: GalleryItem[];
  galleryEnabled: boolean;
  galleryVisible: boolean;
  disabled: boolean;
  onAction: (action: OperatorAction) => void;
}

/** Published photos, for the team to remove one if needed. */
export function GalleryModeration({
  photos,
  galleryEnabled,
  galleryVisible,
  disabled,
  onAction,
}: Props) {
  // One photo at a time, and nothing is deleted before an explicit yes.
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <section aria-labelledby="gallery-title" className="flex flex-col gap-3">
      <h2 id="gallery-title" className="text-lg font-semibold">
        Galerie
      </h2>
      <p className="text-sm text-muted">
        {!galleryEnabled
          ? "La galerie est désactivée : les invités ne peuvent pas publier."
          : galleryVisible
            ? "Les invités voient ces photos."
            : "Les invités ne voient pas encore la galerie."}{" "}
        L&apos;accès se règle dans « Paramètres ».
      </p>

      {photos.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-center text-muted shadow-card">
          Aucune photo publiée pour le moment.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((photo) => (
            <li
              key={photo.id}
              data-testid="gallery-photo"
              className="flex flex-col gap-2 rounded-2xl bg-surface p-2 shadow-card"
            >
              {photo.thumbUrl ? (
                // Signed URLs expire within minutes: there is nothing to optimize.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.thumbUrl}
                  alt="Photo publiée"
                  className="aspect-square w-full rounded-xl object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-xl bg-background text-center text-xs text-muted">
                  Photo indisponible
                </div>
              )}

              {confirming === photo.id ? (
                <div
                  role="alertdialog"
                  aria-label="Confirmer la suppression"
                  className="flex flex-col gap-2"
                >
                  <p className="text-sm">
                    Supprimer définitivement cette photo ? Elle disparaîtra pour
                    tous les invités.
                  </p>
                  <Button
                    disabled={disabled}
                    onClick={() => {
                      setConfirming(null);
                      onAction({ type: "delete_photo", photoId: photo.id });
                    }}
                  >
                    Supprimer définitivement
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirming(null)}>
                    Garder la photo
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => setConfirming(photo.id)}
                >
                  Supprimer
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { GuestEvent } from "@/lib/guest/enter-event";

interface Props {
  event: GuestEvent;
  token: string;
  onTakePhoto?: () => void;
  onImportPhoto?: () => void;
}

export function EventHome({ event, token, onTakePhoto, onImportPhoto }: Props) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="break-words text-2xl font-semibold">{event.name}</h1>
        <p className="text-muted">
          Prenez une photo ou choisissez-en une pour l&apos;imprimer.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button onClick={onTakePhoto}>Prendre une photo</Button>
        <Button onClick={onImportPhoto}>Importer une photo</Button>
      </div>

      {event.galleryVisible && (
        <Link href={`/e/${token}/galerie`} className="min-h-12 py-3 text-center underline">
          Voir la galerie
        </Link>
      )}
    </main>
  );
}

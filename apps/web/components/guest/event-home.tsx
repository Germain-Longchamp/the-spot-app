import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import type { GuestEvent } from "@/lib/guest/enter-event";

interface Props {
  event: GuestEvent;
  token: string;
  onTakePhoto?: () => void;
  onImportPhoto?: () => void;
  importing?: boolean;
  importError?: string | null;
  /** Shown below the main actions, so they stay first on screen. */
  children?: React.ReactNode;
}

export function EventHome({
  event,
  token,
  onTakePhoto,
  onImportPhoto,
  importing = false,
  importError = null,
  children,
}: Props) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="break-words text-2xl font-semibold">{event.name}</h1>
        <span aria-hidden="true" className="h-1 w-12 rounded-full bg-brand" />
        <p className="text-muted">
          Prenez une photo ou choisissez-en une pour l&apos;imprimer.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button onClick={onTakePhoto}>Prendre une photo</Button>
        <Button onClick={onImportPhoto} loading={importing}>
          Importer une photo
        </Button>
      </div>

      {importError && <ErrorMessage>{importError}</ErrorMessage>}

      {event.galleryVisible && (
        <Link href={`/e/${token}/galerie`} className="min-h-12 py-3 text-center underline">
          Voir la galerie
        </Link>
      )}

      {children}
    </main>
  );
}

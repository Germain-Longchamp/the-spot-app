import Link from "next/link";
import type { ReactNode } from "react";
import { ErrorMessage } from "@/components/ui/error-message";
import {
  CameraIcon,
  ChevronRightIcon,
  GalleryIcon,
  ImageIcon,
} from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import type { GuestEvent } from "@/lib/guest/enter-event";

interface Props {
  event: GuestEvent;
  token: string;
  onTakePhoto?: () => void;
  onImportPhoto?: () => void;
  importing?: boolean;
  importError?: string | null;
  /** A print the guest should hear about now, above everything. */
  banner?: ReactNode;
  /** Shown at the end, so the main actions stay first on screen. */
  children?: ReactNode;
}

const howItWorks = ["Prenez ou choisissez une photo", "Imprimez-la", "Récupérez-la près de l'imprimante"];

/**
 * The two ways in have the same weight (SCRUM-27): big tiles side by side,
 * easy to hit with a thumb, visible without scrolling on any phone.
 */
function ActionTile({
  icon,
  title,
  hint,
  onClick,
  busy = false,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick?: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className="flex min-h-36 flex-col items-start justify-between gap-4 rounded-3xl bg-accent p-4 text-left text-on-accent shadow-lift transition-transform duration-150 active:scale-[0.97] disabled:opacity-70"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-surface/20">
        {busy ? (
          <span aria-hidden="true" className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          icon
        )}
      </span>
      <span className="flex flex-col">
        <span className="text-lg font-semibold leading-tight">{busy ? "Patientez…" : title}</span>
        <span className="text-sm opacity-90">{hint}</span>
      </span>
    </button>
  );
}

export function EventHome({
  event,
  token,
  onTakePhoto,
  onImportPhoto,
  importing = false,
  importError = null,
  banner,
  children,
}: Props) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md animate-screen-in flex-col gap-6 px-4 pb-10 pt-6">
      {banner}
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo width={224} />
        <h1 className="break-words text-2xl font-semibold">{event.name}</h1>
        <p className="text-muted">
          Prenez une photo ou choisissez-en une : on l&apos;imprime pour vous.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ActionTile
          icon={<CameraIcon size={26} />}
          title="Prendre une photo"
          hint="Avec la caméra"
          onClick={onTakePhoto}
        />
        <ActionTile
          icon={<ImageIcon size={26} />}
          title="Importer une photo"
          hint="Depuis vos photos"
          onClick={onImportPhoto}
          busy={importing}
        />
      </div>

      {importError && <ErrorMessage>{importError}</ErrorMessage>}

      <ol aria-label="Comment ça marche" className="grid grid-cols-3 gap-2 text-center text-sm text-muted">
        {howItWorks.map((step, index) => (
          <li key={step} className="flex flex-col items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-brand-soft font-semibold text-on-brand"
            >
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      {/* The one way to every photo, the guest's own included (SCRUM-63):
          always there, even while the gallery is closed or off. */}
      <Link
        href={`/e/${token}/galerie`}
        className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-4 font-semibold shadow-card transition-transform active:scale-[0.98]"
      >
        <GalleryIcon size={22} className="text-accent" />
        <span className="flex-1">
          {event.galleryEnabled ? "Galerie de l'événement" : "Vos photos"}
        </span>
        <ChevronRightIcon size={20} className="text-muted" />
      </Link>

      {children}
    </main>
  );
}

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
import { galleryCountText } from "@/lib/guest/gallery";

interface Props {
  event: GuestEvent;
  token: string;
  onTakePhoto?: () => void;
  onImportPhoto?: () => void;
  importing?: boolean;
  importError?: string | null;
  /** The guest's prints, under the two actions (SCRUM-57). */
  banner?: ReactNode;
  /** Photos behind the gallery entry; null while unknown. */
  galleryCount?: number | null;
  /** Shown at the end, so the main actions stay first on screen. */
  children?: ReactNode;
}

/** "21 janvier 2027": the date as entered, whatever the phone's time zone. */
export function eventDateText(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * One main action, one secondary (Alison's home, SCRUM-57): taking a photo
 * comes first, importing one stays a tap away. Both fit without scrolling,
 * down to a 320 x 568 phone.
 */
function Action({
  primary,
  icon,
  title,
  hint,
  onClick,
  busy = false,
}: {
  primary: boolean;
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
      data-variant={primary ? "primary" : "secondary"}
      className={`flex items-center gap-4 rounded-[20px] text-left transition-transform duration-150 active:scale-[0.97] disabled:opacity-70 ${
        primary
          ? "min-h-[88px] bg-accent p-5 text-on-accent shadow-lift"
          : "min-h-[72px] border-[1.5px] border-accent bg-surface px-5 py-4 text-accent"
      }`}
    >
      <span
        className={`flex shrink-0 items-center justify-center ${
          primary ? "size-12 rounded-2xl bg-surface/20" : "size-10 rounded-xl bg-background"
        }`}
      >
        {busy ? (
          <span aria-hidden="true" className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          icon
        )}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className={primary ? "text-lg font-bold" : "text-base font-semibold"}>
          {busy ? "Patientez…" : title}
        </span>
        <span className={`text-[13px] ${primary ? "opacity-90" : "text-muted"}`}>{hint}</span>
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
  galleryCount = null,
  children,
}: Props) {
  const open = event.galleryEnabled && event.galleryVisible;
  const count = galleryCount === null ? null : galleryCountText(galleryCount, open ? "shared" : "mine");
  const galleryHint = event.galleryEnabled && !open
    ? ["Dévoilée plus tard", count].filter(Boolean).join(" · ")
    : count;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md animate-screen-in flex-col gap-5 px-4 pb-8 pt-3">
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo width={224} />
        {event.eventDate && (
          <span data-testid="event-date" className="text-xs uppercase tracking-[0.18em] text-muted">
            {eventDateText(event.eventDate)}
          </span>
        )}
        <h1 className="break-words text-[1.75rem] font-bold leading-tight text-accent">{event.name}</h1>
        <p className="text-muted">
          Prenez une photo ou choisissez-en une : on l&apos;imprime pour vous.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Action
          primary
          icon={<CameraIcon size={26} />}
          title="Prendre une photo"
          hint="Avec l'appareil de votre téléphone"
          onClick={onTakePhoto}
        />
        <Action
          primary={false}
          icon={<ImageIcon size={22} />}
          title="Importer une photo"
          hint="Depuis vos photos"
          onClick={onImportPhoto}
          busy={importing}
        />
      </div>

      {importError && <ErrorMessage>{importError}</ErrorMessage>}

      {banner}

      <div className="flex-1" />

      {/* The one way to every photo, the guest's own included (SCRUM-63):
          always there, even while the gallery is closed or off. */}
      <Link
        href={`/e/${token}/galerie`}
        className="flex min-h-16 items-center gap-3.5 rounded-2xl border border-divider bg-surface px-4 py-3 transition-transform active:scale-[0.98]"
      >
        <GalleryIcon size={24} className="shrink-0 text-accent" />
        <span className="flex flex-1 flex-col">
          <span className="font-semibold">
            {event.galleryEnabled ? "Voir la galerie" : "Vos photos"}
          </span>
          {galleryHint && (
            <span data-testid="gallery-count" className="text-[13px] text-muted">
              {galleryHint}
            </span>
          )}
        </span>
        <ChevronRightIcon size={20} className="shrink-0 text-muted" />
      </Link>

      {children}
    </main>
  );
}

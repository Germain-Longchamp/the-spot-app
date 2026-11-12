"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PhotoDetail, useAlbum } from "@/components/guest/album";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { ArrowLeftIcon, ArrowUpIcon, CameraIcon, GiftIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import type { GuestEvent } from "@/lib/guest/enter-event";
import {
  countGalleryPhotos,
  diffGallery,
  GALLERY_PAGE_SIZE,
  GALLERY_POLL_INTERVAL_MS,
  GalleryPhoto,
  loadGalleryPage,
  loadGalleryState,
  loadGalleryRows,
  newPhotosText,
  signFullImage,
  TAKE_PHOTO_HASH,
  toGalleryPhotos,
} from "@/lib/guest/gallery";
import { createClient } from "@/lib/supabase/client";

interface Props {
  event: GuestEvent;
  token: string;
  guestId: string;
}

/**
 * The one way to every photo (SCRUM-63): what the other guests shared when
 * the gallery is open, and all of this guest's own photos, whatever the
 * gallery state. A guest's own photo opens with its print tracking, or the
 * way to print it. Kept fresh on its own (SCRUM-54).
 */
export function Gallery({ event, token, guestId }: Props) {
  // The team may open the gallery meanwhile (SCRUM-56): read again on the
  // gallery's own pace, the screen switches at the next read.
  const [state, setState] = useState({
    enabled: event.galleryEnabled,
    visible: event.galleryVisible,
  });
  useEffect(() => {
    const supabase = createClient();
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      const next = await loadGalleryState(supabase, event.id);
      if (next) {
        setState((current) =>
          current.enabled === next.enabled && current.visible === next.visible ? current : next
        );
      }
    };
    const timer = setInterval(tick, GALLERY_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [event.id]);
  const open = state.enabled && state.visible;
  const closed = state.enabled && !state.visible;
  const album = useAlbum(event.id, guestId, true);
  const [mineOpened, setMineOpened] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const detail = mineOpened
    ? album.items?.find((item) => item.photoId === mineOpened)
    : undefined;

  // The grid is hidden under the photo, so the browser forgets where it was:
  // kept here, the photo opens at the top and the grid comes back in place.
  const gridScroll = useRef(0);
  const openMine = (photoId: string) => {
    gridScroll.current = window.scrollY;
    setMineOpened(photoId);
  };
  const showing = Boolean(detail);
  useLayoutEffect(() => {
    window.scrollTo({ top: showing ? 0 : gridScroll.current });
  }, [showing]);

  return (
    <>
      {detail && (
        <PhotoDetail
          key={detail.photoId}
          item={detail}
          eventId={event.id}
          backLabel="Galerie"
          onBack={() => setMineOpened(null)}
          onPrinted={album.refresh}
        />
      )}

      {/* Kept mounted under the detail: loaded pages and scroll survive. */}
      {/* A class, not the hidden attribute: "flex" would override it (SCRUM-64). */}
      <main
        data-testid="gallery-screen"
        className={`${detail ? "hidden" : "flex"} mx-auto min-h-[100dvh] max-w-2xl animate-screen-in flex-col gap-3.5 px-4 pb-32 pt-4`}
      >
        <header className="flex min-h-11 items-center justify-between gap-3">
          <Link
            href={`/e/${token}`}
            className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 font-semibold transition-transform active:scale-95"
          >
            <ArrowLeftIcon size={22} />
            Accueil
          </Link>
          <Logo variant="icon" width={28} />
        </header>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold text-accent">
            {state.enabled ? "Galerie" : "Vos photos"}
          </h1>
          {!closed && count !== null && count > 0 && (
            <span data-testid="gallery-total" className="text-[13px] text-muted">
              {count === 1 ? "1 photo" : `${count} photos`}
            </span>
          )}
        </div>

        {/* The surprise (SCRUM-56): only the guest's own photos come back. */}
        {closed && (
          <>
            <section
              data-testid="gallery-surprise"
              className="flex flex-col items-center gap-3 rounded-2xl border border-divider bg-surface px-6 py-7 text-center"
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-on-brand">
                <GiftIcon size={28} />
              </span>
              <h2 className="text-lg font-bold">La galerie est une surprise</h2>
              <p className="text-sm text-muted">
                La galerie de {event.name} sera dévoilée plus tard. En attendant, vos
                photos sont bien gardées.
              </p>
            </section>
            <div className="flex items-baseline justify-between gap-3 pt-1">
              <h2 className="font-bold">Vos photos</h2>
              {count !== null && count > 0 && (
                <span data-testid="gallery-total" className="text-[13px] text-muted">
                  {count === 1 ? "1 photo" : `${count} photos`}
                </span>
              )}
            </div>
          </>
        )}

        <GalleryGrid
          key={open ? "open" : "own"}
          eventId={event.id}
          open={open}
          onCount={setCount}
          onOpenMine={(photo) => {
            // The print state of the guest's photos may not be read yet: the
            // plain viewer is shown meanwhile.
            if (album.items?.some((item) => item.photoId === photo.id)) {
              openMine(photo.id);
              return true;
            }
            return false;
          }}
        />
      </main>

      {!detail && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto mx-auto max-w-2xl px-4">
            <Link
              href={`/e/${token}#${TAKE_PHOTO_HASH}`}
              className="flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-accent font-bold text-on-accent shadow-lift transition-transform active:scale-[0.98]"
            >
              <CameraIcon size={22} />
              Prendre une photo
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

/** Near enough to the top to take new photos without moving anything. */
const AT_TOP_PX = 80;
const atTop = () => window.scrollY <= AT_TOP_PX;

function GalleryGrid({
  eventId,
  open,
  onCount,
  onOpenMine,
}: {
  eventId: string;
  open: boolean;
  onCount: (count: number) => void;
  /** Opens one of the guest's own photos; false if it cannot yet. */
  onOpenMine: (photo: GalleryPhoto) => boolean;
}) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  /** Arrived while the guest was further down: shown on demand. */
  const [waiting, setWaiting] = useState<GalleryPhoto[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const supabase = useRef(createClient());
  const shown = useRef<GalleryPhoto[]>([]);
  const held = useRef<GalleryPhoto[]>([]);
  const busy = useRef(false);
  shown.current = photos;
  held.current = waiting;

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      if (nextPage === 0) {
        countGalleryPhotos(supabase.current, eventId, "all").then(
          (count) => count !== null && onCount(count)
        );
      }
      const result = await loadGalleryPage(supabase.current, eventId, nextPage);
      setLoading(false);
      if (!result) {
        setOffline(true);
        return;
      }
      setOffline(false);
      setLoaded(true);
      setPhotos((current) =>
        nextPage === 0 ? result.photos : [...current, ...result.photos]
      );
      setPage(nextPage);
      setMore(result.more);
    },
    [eventId, onCount]
  );

  /** Shows the photos that arrived meanwhile, on top. */
  const reveal = useCallback(() => {
    const arrived = held.current;
    if (!arrived.length) return;
    setWaiting([]);
    setPhotos((current) => [...arrived, ...current.filter((p) => !arrived.some((a) => a.id === p.id))]);
  }, []);

  /**
   * Reads the newest rows again, as many as shown plus a page: removed photos
   * go, new ones appear at once if the guest is at the top, else wait behind
   * the pill. Nothing moves under the guest's finger.
   */
  const refresh = useCallback(async () => {
    if (busy.current || document.visibilityState === "hidden") return;
    busy.current = true;
    try {
      const count = await countGalleryPhotos(supabase.current, eventId, "all");
      if (count !== null) onCount(count);

      const known = [...held.current, ...shown.current];
      const requested = shown.current.length + held.current.length + GALLERY_PAGE_SIZE;
      const rows = await loadGalleryRows(supabase.current, eventId, 0, requested - 1);
      if (!rows) {
        setOffline(true);
        return;
      }
      setOffline(false);

      const { kept, fresh } = diffGallery(known, rows, requested);
      const keptIds = new Set(kept.map((photo) => photo.id));
      setPhotos((current) => current.flatMap((photo) =>
        keptIds.has(photo.id) ? [kept.find((k) => k.id === photo.id)!] : []
      ));
      const stillWaiting = held.current.filter((photo) => keptIds.has(photo.id));
      const arrived = (await toGalleryPhotos(supabase.current, fresh)) ?? [];
      const next = [...arrived, ...stillWaiting];
      held.current = next;
      setWaiting(next);
      if (atTop()) reveal();
    } finally {
      busy.current = false;
    }
  }, [eventId, onCount, reveal]);

  useEffect(() => {
    load(0);
  }, [load]);

  // Every few seconds while the page is in sight; at once when it comes back.
  useEffect(() => {
    const tick = () => (loaded ? refresh() : load(0));
    const timer = setInterval(tick, GALLERY_POLL_INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loaded, load, refresh]);

  // Back at the top by themselves: the waiting photos come in.
  useEffect(() => {
    if (!waiting.length) return;
    const onScroll = () => atTop() && reveal();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [waiting.length, reveal]);

  /** A photo removed while someone looks at the gallery just disappears. */
  const forget = (id: string) =>
    setPhotos((current) => current.filter((photo) => photo.id !== id));

  const offlineNotice = offline && (
    <p role="status" className="text-sm text-muted">
      Connexion perdue, nouvelle tentative…
    </p>
  );

  if (loaded && photos.length === 0 && waiting.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-lg">
          {open
            ? "Aucune photo pour l'instant. Partagez la vôtre depuis l'accueil : elle apparaîtra ici."
            : "Vous n'avez pas encore de photo."}
        </p>
        {offlineNotice}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {waiting.length > 0 && (
        <div className="pointer-events-none sticky top-3 z-10 -mb-14 flex h-10 justify-center">
          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0 });
              reveal();
            }}
            className="pointer-events-auto flex min-h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[13.5px] font-semibold text-surface shadow-lift transition-transform active:scale-95"
          >
            <ArrowUpIcon size={16} />
            {newPhotosText(waiting.length)}
          </button>
        </div>
      )}

      {offlineNotice}

      <ul className="grid grid-cols-3 gap-1.5">
        {photos.map((photo) => (
          <li key={photo.id} className="relative">
            <button
              type="button"
              data-testid="gallery-photo"
              onClick={() => {
                if (!(photo.mine && onOpenMine(photo))) setOpened(photo.fullPath);
              }}
              className="block w-full"
              aria-label={photo.mine ? "Ouvrir votre photo" : "Agrandir la photo"}
            >
              {/* Signed, short-lived links: an image optimizer would cache them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbUrl}
                alt="Photo de la galerie"
                loading="lazy"
                onError={() => forget(photo.id)}
                className="aspect-square w-full rounded-lg object-cover transition-transform active:scale-95"
              />
            </button>
            {photo.mine && (
              <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex flex-wrap gap-1">
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-accent">
                  Vous
                </span>
                {!photo.shared && (
                  <span className="rounded-full bg-foreground/80 px-2 py-0.5 text-[11px] font-semibold text-surface">
                    Non partagée
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      {loading && (
        <p role="status" className="text-muted">
          Chargement de la galerie…
        </p>
      )}

      {more && !loading && (
        <Button variant="secondary" onClick={() => load(page + 1)}>
          Voir plus de photos
        </Button>
      )}

      {opened && <Viewer path={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}

function Viewer({ path, onClose }: { path: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    signFullImage(createClient(), path).then((signed) => {
      if (!active) return;
      if (signed) setUrl(signed);
      else setFailed(true);
    });
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      active = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [path, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo agrandie"
      className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/95 p-4"
    >
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Photo agrandie"
          onError={() => setFailed(true)}
          className="max-h-[80vh] max-w-full rounded-lg object-contain"
        />
      )}
      {!url && !failed && (
        <p role="status" className="text-muted">
          Chargement de la photo…
        </p>
      )}
      {failed && <ErrorMessage>Cette photo n&apos;est plus disponible.</ErrorMessage>}
      <Button onClick={onClose}>Fermer</Button>
    </div>
  );
}

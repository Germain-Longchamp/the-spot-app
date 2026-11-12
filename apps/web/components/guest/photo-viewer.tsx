"use client";

import Link from "next/link";
import {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { printBadge } from "@/components/guest/album";
import { PrinterStatus } from "@/components/printer-status";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PrinterIcon,
} from "@/components/ui/icons";
import { AlbumItem, canPrint } from "@/lib/guest/album";
import {
  GalleryPhoto,
  GONE_DELAY_MS,
  PHOTO_PARAM,
  PRINTS_HASH,
  signFullImage,
} from "@/lib/guest/gallery";
import { unavailableMessages } from "@/lib/print/availability";
import { printRequestMessages } from "@/lib/print/request-print";
import { usePrintRequest } from "@/lib/print/use-print-request";
import { createClient } from "@/lib/supabase/client";

/** A horizontal move longer than this changes the photo; shorter is a tap. */
const SWIPE_PX = 50;

const addressOf = (photoId: string) =>
  `${window.location.pathname}?${PHOTO_PARAM}=${encodeURIComponent(photoId)}`;

interface Props {
  /** The grid as it is now: newest first, older pages appended as they load. */
  photos: GalleryPhoto[];
  startId: string;
  /** Photos in the gallery when the viewer opened, loaded or not. */
  total: number | null;
  /** Older photos are still to load. */
  more: boolean;
  onLoadMore: () => void;
  /** The guest's photos with their print state; null until first read. */
  albumItems: AlbumItem[] | null;
  eventId: string;
  token: string;
  onPrinted: () => void;
  /** Called once the viewer is gone from the history too. */
  onClose: () => void;
}

/**
 * Photo en grand (SCRUM-55, Alison's screen 5): one viewer for every photo of
 * the gallery, the guest's own included. Swipe or arrows to move, the counter
 * on top. The guest's photos carry "Vous", their print state as a pill that
 * opens "Vos tirages", and the print button when never printed.
 *
 * The photos on screen are frozen when it opens: new ones wait for the grid,
 * so neither the photo nor the counter moves under the guest's eyes.
 */
export function PhotoViewer({
  photos,
  startId,
  total,
  more,
  onLoadMore,
  albumItems,
  eventId,
  token,
  onPrinted,
  onClose,
}: Props) {
  const [list, setList] = useState(photos);
  const [currentId, setCurrentId] = useState(startId);
  const [frozenTotal] = useState(total);
  const [failed, setFailed] = useState<string | null>(null);
  const wantsNext = useRef(false);
  const client = useMemo(() => createClient(), []);
  const signed = useRef(new Map<string, string>());

  // Older pages come at the end; new photos at the top are left to the grid.
  useEffect(() => {
    setList((current) => {
      const last = current[current.length - 1];
      if (!last) return current;
      const known = new Set(current.map((photo) => photo.id));
      const older = photos.filter(
        (photo) => !known.has(photo.id) && photo.createdAt < last.createdAt
      );
      return older.length ? [...current, ...older] : current;
    });
  }, [photos]);

  // Removed by the team: out of the way, except the one being looked at.
  const live = useMemo(() => new Set(photos.map((photo) => photo.id)), [photos]);
  const view = useMemo(
    () => list.filter((photo) => live.has(photo.id) || photo.id === currentId),
    [list, live, currentId]
  );
  const index = Math.max(0, view.findIndex((photo) => photo.id === currentId));
  const current = view[index];
  const gone = !live.has(currentId) || failed === currentId;
  const hasPrev = index > 0;
  const hasNext = index < view.length - 1 || more;
  const shownTotal = more ? Math.max(frozenTotal ?? 0, view.length) : view.length;

  const show = useCallback((photoId: string) => {
    setCurrentId(photoId);
    history.replaceState(history.state, "", addressOf(photoId));
  }, []);

  const go = useCallback(
    (step: 1 | -1) => {
      const target = view[index + step];
      if (target) return show(target.id);
      if (step === 1 && more) {
        wantsNext.current = true;
        onLoadMore();
      }
    },
    [view, index, more, onLoadMore, show]
  );

  // The next page arrived after "Photo suivante" at the end of the loaded ones.
  useEffect(() => {
    if (!wantsNext.current || !view[index + 1]) return;
    wantsNext.current = false;
    show(view[index + 1].id);
  }, [view, index, show]);

  // The phone's back button closes the viewer, back on the grid (SCRUM-55).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(PHOTO_PARAM)) history.pushState(history.state, "", addressOf(startId));
    // The browser would put the page back where it was when the viewer
    // opened (the top): the gallery restores the grid's place itself.
    const restoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      history.scrollRestoration = restoration;
    };
  }, [startId, onClose]);

  const close = useCallback(() => history.back(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, go]);

  // A photo that is no longer there: say so, then the next one.
  useEffect(() => {
    if (!gone) return;
    const timer = setTimeout(() => {
      if (index < view.length - 1) go(1);
      else if (hasPrev) go(-1);
      else close();
    }, GONE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [gone, index, view.length, hasPrev, go, close]);

  /** Signs a photo's full image once, and keeps the link for the session. */
  const sign = useCallback(
    async (photo: GalleryPhoto) => {
      const known = signed.current.get(photo.id);
      if (known) return known;
      const url = await signFullImage(client, photo.fullPath);
      if (url) signed.current.set(photo.id, url);
      return url;
    },
    [client]
  );

  // The neighbours load meanwhile, so a swipe shows them at once.
  useEffect(() => {
    for (const neighbour of [view[index - 1], view[index + 1]]) {
      if (!neighbour) continue;
      sign(neighbour).then((url) => {
        if (url) new Image().src = url;
      });
    }
  }, [view, index, sign]);

  const start = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (event: PointerEvent) => {
    start.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    const from = start.current;
    start.current = null;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    go(dx < 0 ? 1 : -1);
  };

  if (!current) return null;
  const mine = current.mine
    ? albumItems?.find((item) => item.photoId === current.id)
    : undefined;

  const arrows = {
    prev: hasPrev ? (
      <ArrowButton label="Photo précédente" onClick={() => go(-1)}>
        <ChevronLeftIcon size={22} />
      </ArrowButton>
    ) : (
      <span className="size-12" />
    ),
    next: hasNext ? (
      <ArrowButton label="Photo suivante" onClick={() => go(1)}>
        <ChevronRightIcon size={22} />
      </ArrowButton>
    ) : (
      <span className="size-12" />
    ),
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo agrandie"
      className="fixed inset-0 z-20 flex flex-col gap-4 overscroll-contain bg-foreground px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-surface"
    >
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
        <button
          type="button"
          onClick={close}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-surface/35 pl-2 pr-3.5 text-[15px] font-semibold transition-transform active:scale-95"
        >
          <ArrowLeftIcon size={20} />
          Galerie
        </button>
        <span data-testid="viewer-counter" aria-live="polite" className="text-sm text-surface/80">
          {index + 1} / {shownTotal}
        </span>
      </header>

      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (start.current = null)}
        className="flex min-h-0 flex-1 select-none items-center justify-center [touch-action:pan-y_pinch-zoom]"
      >
        {gone ? (
          <p role="status" className="text-center text-lg">
            Cette photo n&apos;est plus disponible.
          </p>
        ) : (
          <FullImage
            key={current.id}
            photo={current}
            sign={sign}
            onFailed={() => setFailed(current.id)}
          />
        )}
      </div>

      {current.mine && !gone ? (
        <OwnPhotoFooter
          key={current.id}
          photo={current}
          item={mine}
          eventId={eventId}
          token={token}
          arrows={arrows}
          onPrinted={onPrinted}
        />
      ) : (
        <Footer arrows={arrows} />
      )}
    </div>
  );
}

/** The thumbnail at once, then the full image: never a black screen. */
function FullImage({
  photo,
  sign,
  onFailed,
}: {
  photo: GalleryPhoto;
  sign: (photo: GalleryPhoto) => Promise<string | null>;
  onFailed: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    sign(photo).then((signed) => {
      if (!active) return;
      if (signed) setUrl(signed);
      else onFailed();
    });
    return () => {
      active = false;
    };
    // Once per photo: the component is keyed by it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // Signed, short-lived links: an image optimizer would cache them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url ?? photo.thumbUrl}
      alt={photo.mine ? "Votre photo" : "Photo agrandie"}
      data-full={url ? "true" : "false"}
      draggable={false}
      onError={() => url && onFailed()}
      className={`h-full w-full object-contain transition-[filter] duration-300 ${url ? "" : "blur-sm"}`}
    />
  );
}

function ArrowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface/10 transition-transform active:scale-90"
    >
      {children}
    </button>
  );
}

/** The bottom of the viewer: what the photo is, then the arrows. */
function Footer({
  arrows,
  info,
  center,
}: {
  arrows: { prev: ReactNode; next: ReactNode };
  info?: ReactNode;
  center?: ReactNode;
}) {
  return (
    <footer className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      {info}
      <p className="text-center text-[13px] text-surface/80">
        Glissez pour voir les autres photos
      </p>
      <div className="flex items-center justify-between gap-3">
        {arrows.prev}
        <div className="flex min-w-0 flex-1 justify-center">{center}</div>
        {arrows.next}
      </div>
    </footer>
  );
}

/**
 * The guest's own photo: "Vous", "Non partagée", where its print stands (a
 * pill to "Vos tirages") or the way to print it, with the printer's state
 * (UX rule 1). No step-by-step tracking here: Germain, 2026-11-12.
 */
function OwnPhotoFooter({
  photo,
  item,
  eventId,
  token,
  arrows,
  onPrinted,
}: {
  photo: GalleryPhoto;
  item: AlbumItem | undefined;
  eventId: string;
  token: string;
  arrows: { prev: ReactNode; next: ReactNode };
  onPrinted: () => void;
}) {
  const print = usePrintRequest(photo.id);
  const printable = item !== undefined && canPrint(item);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const client = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!printable) return;
    let active = true;
    client
      .rpc("get_print_availability", { p_event_id: eventId })
      .then(({ data }) => active && setUnavailable(unavailableMessages[data] ?? null));
    return () => {
      active = false;
    };
  }, [client, eventId, printable]);

  async function printIt() {
    if ((await print.press()) === "created") onPrinted();
  }

  const refusal =
    print.outcome && print.outcome !== "created" ? printRequestMessages[print.outcome] : null;
  const status = item?.print?.status;
  const tracked = status && status !== "CANCELLED";

  const info = (
    <div className="flex flex-col items-start gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-accent">
          Vous
        </span>
        {!photo.shared && (
          <span className="rounded-full bg-surface/15 px-2.5 py-1 text-xs font-semibold">
            Non partagée
          </span>
        )}
        {tracked && (
          <Link
            href={`/e/${token}#${PRINTS_HASH}`}
            data-testid="viewer-print-state"
            className={`inline-flex min-h-8 items-center gap-1 rounded-full py-1 pl-2.5 pr-1.5 text-xs font-semibold ${printBadge[status].tone}`}
          >
            {printBadge[status].text}
            <ChevronRightIcon size={14} />
          </Link>
        )}
      </div>
      {status === "CANCELLED" && (
        <p className="text-sm text-surface/80">
          Votre précédente demande a été annulée par l&apos;équipe.
        </p>
      )}
      {printable && (
        // The pill is white: its text keeps the dark ink of the light screens.
        <div className="text-foreground">
          <PrinterStatus eventId={eventId} />
        </div>
      )}
      {printable && (refusal ?? unavailable) && (
        <p role="status" className="rounded-2xl bg-brand-soft px-3.5 py-2.5 text-sm text-on-brand">
          {refusal ?? unavailable}
        </p>
      )}
      {print.outcome === "unexpected_error" && (
        <ErrorMessage>{printRequestMessages.unexpected_error}</ErrorMessage>
      )}
    </div>
  );

  return (
    <Footer
      arrows={arrows}
      info={info}
      center={
        printable ? (
          <Button
            icon={<PrinterIcon size={20} />}
            onClick={printIt}
            loading={print.sending}
            disabled={print.finished || unavailable !== null}
            className="min-h-12 rounded-full px-5"
          >
            Imprimer
          </Button>
        ) : undefined
      }
    />
  );
}

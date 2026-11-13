"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { PrintPreview } from "@/components/guest/print-preview";
import type { FrameText } from "@/lib/print/layout";
import { CloseIcon } from "@/components/ui/icons";

const MAX_SCALE = 4;
/** Scale of a double tap. */
const TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;

interface View {
  scale: number;
  x: number;
  y: number;
}

const REST: View = { scale: 1, x: 0, y: 0 };

/**
 * The print full screen (SCRUM-66): to check the details without crowding
 * the "Votre photo" screen. Two fingers zoom, one finger moves the zoomed
 * print, a double tap zooms in or back. The phone's back button closes it,
 * as in the gallery's viewer.
 */
export function PrintZoom({
  src,
  frame,
  onClose,
}: {
  src: string;
  frame?: FrameText | null;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>(REST);
  const area = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; view: View; x: number; y: number } | null>(null);
  const lastTap = useRef(0);

  // One step in the history: "back" closes the print, not the screen.
  const closed = useRef(false);
  useEffect(() => {
    history.pushState(history.state, "", location.href);
    const onPop = () => {
      closed.current = true;
      onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [onClose]);
  const close = useCallback(() => {
    if (!closed.current) history.back();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  /** The zoomed print never leaves the screen entirely. */
  const bounded = (next: View): View => {
    const scale = Math.min(MAX_SCALE, Math.max(1, next.scale));
    const box = area.current?.getBoundingClientRect();
    const maxX = box ? ((scale - 1) * box.width) / 2 : 0;
    const maxY = box ? ((scale - 1) * box.height) / 2 : 0;
    return {
      scale,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const startGesture = () => {
    const points = Array.from(pointers.current.values());
    const [a, b] = points;
    gesture.current = {
      distance: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
      view,
      x: a.x,
      y: a.y,
    };
  };

  const onPointerDown = (event: PointerEvent) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer knows: the gesture works without.
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    startGesture();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(pointers.current.values());
    const start = gesture.current;
    if (points.length >= 2 && start.distance > 0) {
      const [a, b] = points;
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / start.distance;
      setView(bounded({ ...start.view, scale: start.view.scale * ratio }));
    } else if (points.length === 1 && start.view.scale > 1) {
      const [a] = points;
      setView(bounded({ ...start.view, x: start.view.x + a.x - start.x, y: start.view.y + a.y - start.y }));
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    const wasTap =
      pointers.current.size === 1 &&
      gesture.current !== null &&
      Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) < 10;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size > 0) {
      startGesture();
      return;
    }
    gesture.current = null;
    if (!wasTap) return;
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      setView((current) => (current.scale > 1 ? REST : { scale: TAP_SCALE, x: 0, y: 0 }));
    } else {
      lastTap.current = now;
    }
  };

  const onPointerCancel = (event: PointerEvent) => {
    pointers.current.delete(event.pointerId);
    gesture.current = null;
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tirage en grand"
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <div className="flex justify-end px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={close}
          aria-label="Fermer"
          className="inline-flex size-11 items-center justify-center rounded-full bg-white/15 text-white transition-transform active:scale-95"
        >
          <CloseIcon size={22} />
        </button>
      </div>
      <div
        ref={area}
        data-testid="print-zoom-area"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="flex min-h-0 flex-1 select-none overflow-hidden p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] [touch-action:none]"
      >
        <div
          data-testid="print-zoom"
          data-scale={view.scale.toFixed(2)}
          className="flex min-h-0 flex-1 transition-transform duration-75"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <PrintPreview src={src} fit frame={frame} />
        </div>
      </div>
    </div>,
    document.body
  );
}

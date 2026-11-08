"use client";

import { KeyboardEvent, ReactNode, useRef, useState } from "react";
import { EventSettings } from "@/components/operator/event-settings";
import { GalleryModeration } from "@/components/operator/gallery-moderation";
import { PrintQueue } from "@/components/operator/print-queue";
import { PrinterStatusView } from "@/components/printer-status";
import { AlertIcon, GalleryIcon, PrinterIcon, SlidersIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import type { OperatorAction } from "@/lib/operator/actions";
import { panelCounts, PanelSnapshot } from "@/lib/operator/panel";

interface Props {
  snapshot: PanelSnapshot;
  onAction: (action: OperatorAction) => Promise<string>;
}

export type View = "prints" | "gallery" | "settings";

const VIEWS: { id: View; label: string }[] = [
  { id: "prints", label: "Impressions" },
  { id: "gallery", label: "Galerie" },
  { id: "settings", label: "Paramètres" },
];

/**
 * The salon team's screen: a header that never scrolls away (printer state,
 * pause, closed event), then one view at a time. The print queue opens first:
 * it is what the team watches all day.
 */
export function OperatorPanel({ snapshot, onAction }: Props) {
  const [view, setView] = useState<View>("prints");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const counts = panelCounts(snapshot.jobs);

  async function act(action: OperatorAction) {
    setBusy(true);
    setMessage(await onAction(action));
    setBusy(false);
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col">
      <header className="flex min-w-0 items-center gap-3 px-4 pt-4">
        <Logo variant="short" width={160} />
        <h1 className="min-w-0 break-words text-lg font-semibold">
          {snapshot.eventName}
        </h1>
      </header>

      {/* Stays on screen while scrolling: the printer state is never out of
          sight (UX rule 1), nor the way to another view. */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background/95 px-4 pb-3 pt-3 backdrop-blur">
        <PrinterStatusView
          state={snapshot.printerOnline ? "online" : "offline"}
        />

        {!snapshot.eventOpen && (
          <Banner tone="brand">
            Événement fermé : les invités ne peuvent plus entrer, envoyer de
            photo ni imprimer.
          </Banner>
        )}
        {snapshot.paused && (
          <Banner tone="danger">
            Impressions en pause : les invités ne peuvent plus en demander.
          </Banner>
        )}

        <Tabs
          view={view}
          onChange={(next) => {
            setView(next);
            setMessage("");
          }}
          badges={{
            prints: {
              value: counts.waiting + counts.problems,
              alert: counts.problems > 0,
            },
            gallery: { value: snapshot.gallery.length, alert: false },
          }}
        />
      </div>

      <main
        id={`panel-${view}`}
        role="tabpanel"
        aria-labelledby={`tab-${view}`}
        className="flex flex-1 flex-col gap-4 px-4 pb-10 pt-2"
      >
        <p role="status" aria-live="polite" className="empty:hidden font-semibold">
          {message}
        </p>

        {view === "prints" && (
          <PrintQueue snapshot={snapshot} disabled={busy} onAction={act} />
        )}
        {view === "gallery" && (
          <GalleryModeration
            photos={snapshot.gallery}
            galleryEnabled={snapshot.galleryEnabled}
            galleryVisible={snapshot.galleryVisible}
            disabled={busy}
            onAction={act}
          />
        )}
        {view === "settings" && (
          <EventSettings snapshot={snapshot} disabled={busy} onAction={act} />
        )}
      </main>
    </div>
  );
}

function Banner({ tone, children }: { tone: "brand" | "danger"; children: ReactNode }) {
  const colors =
    tone === "danger" ? "bg-danger text-on-accent" : "bg-brand text-on-brand";
  return (
    <p className={`flex items-start gap-2 rounded-xl px-3 py-2 font-semibold ${colors}`}>
      <AlertIcon size={20} className="mt-0.5 shrink-0" />
      {children}
    </p>
  );
}

const icons: Record<View, ReactNode> = {
  prints: <PrinterIcon size={20} />,
  gallery: <GalleryIcon size={20} />,
  settings: <SlidersIcon size={20} />,
};

function Tabs({
  view,
  onChange,
  badges,
}: {
  view: View;
  onChange: (view: View) => void;
  badges: Partial<Record<View, { value: number; alert: boolean }>>;
}) {
  const refs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({});

  // Arrow keys move between tabs, as screen reader users expect.
  function onKeyDown(event: KeyboardEvent) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const index = VIEWS.findIndex((v) => v.id === view);
    const next = VIEWS[(index + step + VIEWS.length) % VIEWS.length].id;
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Vues du panneau"
      onKeyDown={onKeyDown}
      className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1 shadow-card"
    >
      {VIEWS.map(({ id, label }) => {
        const selected = id === view;
        const badge = badges[id];
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            className={`relative flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold sm:text-base ${
              selected ? "bg-accent text-on-accent" : "text-foreground hover:bg-accent-soft"
            }`}
          >
            <span className="hidden sm:inline">{icons[id]}</span>
            <span className="truncate">{label}</span>
            {badge && badge.value > 0 && (
              <span
                data-testid={`badge-${id}`}
                className={`absolute -right-0.5 -top-1.5 min-w-5 rounded-full px-1 text-[11px] leading-5 sm:static sm:min-w-6 sm:px-1.5 sm:text-xs sm:leading-6 ${
                  badge.alert
                    ? "bg-danger text-on-accent"
                    : selected
                      ? "bg-surface text-foreground"
                      : "bg-accent-soft text-foreground"
                }`}
              >
                {badge.value}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { GuestAccess } from "@/components/operator/guest-access";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import type { AdminEvent, CreateEventInput, CreateEventResult } from "@/lib/admin/events";

export type CreateOutcome = CreateEventResult | { kind: "denied" };
export type ResetOutcome = { operatorPath: string } | { kind: "denied" } | null;

interface Props {
  events: AdminEvent[];
  email: string;
  onCreate: (input: CreateEventInput) => Promise<CreateOutcome>;
  onReset: (eventId: string) => Promise<ResetOutcome>;
  onSignOut: () => void;
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const formatDate = (date: string) => dateFormat.format(new Date(`${date}T00:00:00Z`));

const DENIED = "Votre session a expiré. Reconnectez-vous.";
const FAILED = "L'action n'a pas abouti. Vérifiez le réseau, puis réessayez.";

/** The team's events: create one, find its QR code, replace its operator link. */
export function AdminEvents({ events, email, onCreate, onReset, onSignOut }: Props) {
  // The operator link is shown once, right after it is made.
  const [fresh, setFresh] = useState<{ eventId: string; operatorPath: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col gap-6 px-4 pb-12 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo variant="short" width={160} />
          <h1 className="text-lg font-semibold">Espace admin</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">{email}</span>
          <button type="button" onClick={onSignOut} className="min-h-11 font-semibold underline">
            Se déconnecter
          </button>
        </div>
      </header>

      <CreateEventForm
        onCreate={onCreate}
        onCreated={(eventId, operatorPath) => {
          setFresh({ eventId, operatorPath });
          setOpenId(eventId);
        }}
      />

      <section aria-labelledby="events-title" className="flex flex-col gap-3">
        <h2 id="events-title" className="text-lg font-semibold">
          Événements ({events.length})
        </h2>
        {events.length === 0 ? (
          <p className="rounded-2xl bg-surface p-4 text-center text-muted shadow-card">
            Aucun événement pour le moment.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((event) => (
              <EventItem
                key={event.id}
                event={event}
                open={openId === event.id}
                onToggle={() => setOpenId(openId === event.id ? null : event.id)}
                operatorPath={fresh?.eventId === event.id ? fresh.operatorPath : null}
                onReset={async () => {
                  const outcome = await onReset(event.id);
                  if (outcome && "operatorPath" in outcome) {
                    setFresh({ eventId: event.id, operatorPath: outcome.operatorPath });
                    return null;
                  }
                  return outcome && "kind" in outcome ? DENIED : FAILED;
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CreateEventForm({
  onCreate,
  onCreated,
}: {
  onCreate: (input: CreateEventInput) => Promise<CreateOutcome>;
  onCreated: (eventId: string, operatorPath: string) => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept until the event exists: a retry after a lost answer is the same
  // request, and gives the same event back.
  const key = useRef<string | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    key.current ??= crypto.randomUUID();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    if (!name.trim()) {
      setError("Donnez un nom à l'événement.");
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    key.current ??= crypto.randomUUID();
    try {
      const outcome = await onCreate({ name, date, creationKey: key.current });
      if (outcome.kind === "created" || outcome.kind === "existing") {
        key.current = crypto.randomUUID();
        setName("");
        setDate("");
        onCreated(outcome.event.id, outcome.operatorPath);
      } else if (outcome.kind === "invalid") {
        setError(outcome.message);
      } else {
        setError(outcome.kind === "denied" ? DENIED : FAILED);
      }
    } catch {
      setError(FAILED);
    }
    sending.current = false;
    setBusy(false);
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate aria-labelledby="create-title">
        <h2 id="create-title" className="text-lg font-semibold">
          Créer un événement
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex flex-1 flex-col gap-1 font-semibold">
            Nom de l&apos;événement
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Mariage Dupont"
              className="min-h-[52px] rounded-2xl border border-border bg-background px-4 font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            Date (facultative)
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-[52px] rounded-2xl border border-border bg-background px-4 font-normal"
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy} className="self-start">
          Créer l&apos;événement
        </Button>
      </form>
    </Card>
  );
}

function EventItem({
  event,
  open,
  onToggle,
  operatorPath,
  onReset,
}: {
  event: AdminEvent;
  open: boolean;
  onToggle: () => void;
  operatorPath: string | null;
  onReset: () => Promise<string | null>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setConfirming(false);
    setError(await onReset());
    setBusy(false);
  }

  return (
    <li data-testid="admin-event" className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-left"
      >
        <span className="flex flex-col">
          <span className="font-semibold">{event.name}</span>
          <span className="text-sm text-muted">
            {event.eventDate ? formatDate(event.eventDate) : "Sans date"}
          </span>
        </span>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            event.open ? "bg-accent-soft" : "bg-background text-muted"
          }`}
        >
          {event.open ? "Ouvert" : "Fermé"}
        </span>
      </button>

      {operatorPath && <OperatorLink path={operatorPath} />}

      {open && (
        <div className="flex flex-col gap-3">
          <GuestAccess accessPath={event.accessPath} shortCode={event.shortCode} eventOpen={event.open} />

          {confirming ? (
            <div role="alertdialog" aria-label="Confirmer le nouveau lien" className="flex flex-col gap-2 rounded-xl bg-accent-soft p-3">
              <p className="text-sm">
                Créer un nouveau lien opérateur ? L&apos;ancien cessera aussitôt de marcher, y
                compris sur la tablette du salon.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={reset}>Créer un nouveau lien</Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  Garder l&apos;ancien
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" loading={busy} onClick={() => setConfirming(true)} className="self-start">
              Nouveau lien opérateur…
            </Button>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** Shown once: only its hash is stored, so it cannot be displayed again. */
function OperatorLink({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => setUrl(`${window.location.origin}${path}`), [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Lien copié.");
    } catch {
      setCopied("Copie impossible ici : sélectionnez le lien.");
    }
  }

  return (
    <div data-testid="operator-link" className="flex flex-col gap-2 rounded-xl bg-brand-soft p-3 text-on-brand">
      <p className="font-semibold">Lien du panneau opérateur</p>
      <p className="text-sm">
        Notez-le ou ouvrez-le sur la tablette du salon maintenant : il ne sera plus affiché. En
        cas de perte, créez-en un nouveau.
      </p>
      <p data-testid="operator-url" className="select-all break-all rounded-lg bg-surface px-3 py-2 font-mono text-sm">
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={copy}>
          Copier le lien opérateur
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[52px] items-center justify-center rounded-2xl border border-border bg-surface px-6 font-semibold"
        >
          Ouvrir le panneau
        </a>
      </div>
      <p role="status" aria-live="polite" className="text-sm empty:hidden">
        {copied}
      </p>
    </div>
  );
}

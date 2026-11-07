"use client";

import { useState } from "react";
import { PrinterStatusView } from "@/components/printer-status";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import type { OperatorAction } from "@/lib/operator/actions";
import {
  GalleryItem,
  operatorStatusLabel,
  PanelJob,
  panelCounts,
  PanelSnapshot,
} from "@/lib/operator/panel";

const time = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

interface Props {
  snapshot: PanelSnapshot;
  onAction: (action: OperatorAction) => Promise<string>;
}

export function OperatorPanel({ snapshot, onAction }: Props) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const counts = panelCounts(snapshot.jobs);

  async function act(action: OperatorAction) {
    setBusy(true);
    setMessage(await onAction(action));
    setBusy(false);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Logo variant="short" width={160} />
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="break-words text-xl font-semibold">
              {snapshot.eventName}
            </h1>
            <span
              aria-hidden="true"
              className="block h-1 w-12 rounded-full bg-brand"
            />
          </div>
        </div>
        <PrinterStatusView
          state={snapshot.printerOnline ? "online" : "offline"}
        />
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Counter label="En attente" value={counts.waiting} />
        <Counter label="En impression" value={counts.printing} />
        <Counter label="À vérifier" value={counts.problems} />
        <Counter label="Imprimées" value={counts.done} />
        <Counter
          label="Demandes"
          value={
            snapshot.printLimit === null
              ? String(counts.used)
              : `${counts.used} / ${snapshot.printLimit}`
          }
        />
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => act({ type: snapshot.paused ? "resume" : "pause" })}
        >
          {snapshot.paused ? "Reprendre les impressions" : "Mettre en pause"}
        </Button>
        {snapshot.paused && (
          <p className="font-semibold text-danger">
            Impressions en pause : les invités ne peuvent plus en demander.
          </p>
        )}
      </div>

      {!snapshot.eventOpen && (
        <p className="rounded-lg bg-brand p-3 font-semibold text-on-brand">
          Événement fermé : les invités ne peuvent plus entrer, envoyer de photo
          ni imprimer.
        </p>
      )}

      <p role="status" aria-live="polite" className="min-h-6">
        {message}
      </p>

      {snapshot.jobs.length === 0 ? (
        <p>Aucune demande d&apos;impression pour le moment.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {snapshot.jobs.map((job) => (
            <JobRow key={job.id} job={job} disabled={busy} onAction={act} />
          ))}
        </ul>
      )}

      <GallerySection
        photos={snapshot.gallery}
        disabled={busy}
        onAction={act}
      />

      <SettingsSection snapshot={snapshot} disabled={busy} onAction={act} />
    </main>
  );
}

function Counter({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <dt className="text-sm">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function JobRow({
  job,
  disabled,
  onAction,
}: {
  job: PanelJob;
  disabled: boolean;
  onAction: (action: OperatorAction) => void;
}) {
  const canStart = job.status === "PENDING" && !job.authorized;
  const canRetry = job.status === "STUCK" || job.status === "FAILED";
  const canCancel = canStart || canRetry;

  return (
    <li
      data-testid="job"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3"
    >
      {job.photoUrl ? (
        // Signed URLs expire within minutes: there is nothing to optimize.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={job.photoUrl}
          alt="Photo à imprimer"
          className="size-16 rounded object-cover"
        />
      ) : (
        <div className="flex size-16 items-center justify-center rounded border border-border text-center text-xs">
          Photo indisponible
        </div>
      )}

      <div className="min-w-40 flex-1">
        <p className="font-semibold">{operatorStatusLabel(job)}</p>
        <p className="text-sm">{time.format(new Date(job.createdAt))}</p>
        {job.lastError && (
          <p className="text-sm text-danger">{job.lastError}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {canStart && (
          <Button
            disabled={disabled}
            onClick={() => onAction({ type: "start", jobId: job.id })}
          >
            Lancer
          </Button>
        )}
        {canRetry && (
          <Button
            disabled={disabled}
            onClick={() => onAction({ type: "retry", jobId: job.id })}
          >
            Réessayer
          </Button>
        )}
        {canCancel && (
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => onAction({ type: "cancel", jobId: job.id })}
          >
            Annuler
          </Button>
        )}
      </div>
    </li>
  );
}

function GallerySection({
  photos,
  disabled,
  onAction,
}: {
  photos: GalleryItem[];
  disabled: boolean;
  onAction: (action: OperatorAction) => void;
}) {
  // One photo at a time, and nothing is deleted before an explicit yes.
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <section aria-labelledby="gallery-title" className="flex flex-col gap-3">
      <h2 id="gallery-title" className="text-lg font-semibold">
        Galerie
      </h2>
      {photos.length === 0 ? (
        <p>Aucune photo publiée pour le moment.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((photo) => (
            <li
              key={photo.id}
              data-testid="gallery-photo"
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2"
            >
              {photo.thumbUrl ? (
                // Signed URLs expire within minutes: there is nothing to optimize.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.thumbUrl}
                  alt="Photo publiée"
                  className="aspect-square w-full rounded object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded border border-border text-center text-xs">
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
                  <Button
                    variant="secondary"
                    onClick={() => setConfirming(null)}
                  >
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

function SettingsSection({
  snapshot,
  disabled,
  onAction,
}: {
  snapshot: PanelSnapshot;
  disabled: boolean;
  onAction: (action: OperatorAction) => void;
}) {
  const [limit, setLimit] = useState(
    snapshot.printLimit === null ? "" : String(snapshot.printLimit),
  );
  const [limitError, setLimitError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const { galleryEnabled: enabled, galleryVisible: visible } = snapshot;

  function saveLimit() {
    const text = limit.trim();
    if (text === "") {
      setLimitError(null);
      onAction({ type: "print_limit", limit: null });
      return;
    }
    const value = Number(text);
    if (!Number.isInteger(value) || value < 0) {
      setLimitError(
        "Indiquez un nombre entier, ou laissez vide pour ne pas limiter.",
      );
      return;
    }
    setLimitError(null);
    onAction({ type: "print_limit", limit: value });
  }

  return (
    <section aria-labelledby="settings-title" className="flex flex-col gap-4">
      <h2 id="settings-title" className="text-lg font-semibold">
        Réglages de l&apos;événement
      </h2>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <h3 className="font-semibold">Accès à la galerie</h3>
        <p data-testid="gallery-state" className="text-sm">
          {!enabled
            ? "Pas de galerie : les invités ne peuvent pas publier."
            : visible
              ? "Galerie ouverte : les invités la voient."
              : "Galerie cachée : les invités peuvent publier, elle s'ouvrira plus tard."}
        </p>
        <div className="flex flex-wrap gap-2">
          {enabled && (
            <Button
              disabled={disabled}
              onClick={() =>
                onAction({ type: "gallery", enabled: true, visible: !visible })
              }
            >
              {visible ? "Cacher la galerie" : "Ouvrir la galerie aux invités"}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() =>
              onAction({
                type: "gallery",
                enabled: !enabled,
                visible: enabled ? false : visible,
              })
            }
          >
            {enabled ? "Désactiver la galerie" : "Activer la galerie"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <label htmlFor="print-limit" className="font-semibold">
          Nombre maximal d&apos;impressions
        </label>
        <p className="text-sm text-muted">
          Laissez vide pour ne pas limiter. La limite vaut pour les prochaines
          demandes ; celles déjà faites ne changent pas.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            id="print-limit"
            inputMode="numeric"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            className="min-h-12 w-32 rounded-lg border border-border bg-background px-3"
          />
          <Button disabled={disabled} onClick={saveLimit}>
            Enregistrer la limite
          </Button>
        </div>
        {limitError && (
          <p role="alert" className="text-sm text-danger">
            {limitError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <h3 className="font-semibold">Événement</h3>
        {snapshot.eventOpen ? (
          confirmClose ? (
            <div
              role="alertdialog"
              aria-label="Confirmer la fermeture"
              className="flex flex-col gap-2"
            >
              <p className="text-sm">
                Fermer l&apos;événement ? Les invités ne pourront plus entrer,
                envoyer de photo ni imprimer. Vous pourrez le rouvrir.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={disabled}
                  onClick={() => {
                    setConfirmClose(false);
                    onAction({ type: "close" });
                  }}
                >
                  Fermer l&apos;événement
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmClose(false)}
                >
                  Laisser ouvert
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => setConfirmClose(true)}
            >
              Fermer l&apos;événement…
            </Button>
          )
        ) : (
          <Button
            disabled={disabled}
            onClick={() => onAction({ type: "reopen" })}
          >
            Rouvrir l&apos;événement
          </Button>
        )}
      </div>
    </section>
  );
}

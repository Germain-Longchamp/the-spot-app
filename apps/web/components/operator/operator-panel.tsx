"use client";

import { useState } from "react";
import { PrinterStatusView } from "@/components/printer-status";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import type { OperatorAction } from "@/lib/operator/actions";
import {
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

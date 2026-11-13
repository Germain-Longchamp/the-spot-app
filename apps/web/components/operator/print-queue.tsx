"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  disabled: boolean;
  onAction: (action: OperatorAction) => void;
}

/**
 * The print queue, grouped by what the team has to do: problems first, then
 * the print under way, the queue in order of arrival, and the history folded.
 * The jobs come already sorted (sortJobs): grouping keeps that order.
 */
export function PrintQueue({ snapshot, disabled, onAction }: Props) {
  const counts = panelCounts(snapshot.jobs);
  const of = (...statuses: PanelJob["status"][]) =>
    snapshot.jobs.filter((job) => statuses.includes(job.status));
  const problems = of("STUCK", "FAILED");
  const printing = of("PRINTING");
  const queue = of("PENDING");
  const history = of("DONE", "CANCELLED");
  const active = problems.length + printing.length + queue.length;

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Counter label="En attente" value={counts.waiting} />
        <Counter label="À vérifier" value={counts.problems} alert={counts.problems > 0} />
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

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0">
          {snapshot.paused
            ? "Les invités ne peuvent plus demander d'impression."
            : "Les invités peuvent demander des impressions."}
        </p>
        <Button
          variant={snapshot.paused ? "primary" : "secondary"}
          disabled={disabled}
          onClick={() => onAction({ type: snapshot.paused ? "resume" : "pause" })}
        >
          {snapshot.paused ? "Reprendre les impressions" : "Mettre en pause"}
        </Button>
      </Card>

      {active === 0 && (
        <p className="rounded-2xl bg-surface p-4 text-center text-muted shadow-card">
          Aucune demande d&apos;impression pour le moment.
        </p>
      )}

      {problems.length > 0 && (
        <Section title="À vérifier" count={problems.length} alert>
          {problems.map((job) => (
            <JobRow key={job.id} job={job} disabled={disabled} onAction={onAction} />
          ))}
        </Section>
      )}

      {printing.length > 0 && (
        <Section title="En impression" count={printing.length}>
          {printing.map((job) => (
            <JobRow key={job.id} job={job} disabled={disabled} onAction={onAction} />
          ))}
        </Section>
      )}

      {queue.length > 0 && (
        <Section title="File d'attente" count={queue.length}>
          {queue.map((job, index) => (
            <JobRow
              key={job.id}
              job={job}
              position={index + 1}
              disabled={disabled}
              onAction={onAction}
            />
          ))}
        </Section>
      )}

      {history.length > 0 && (
        <details className="group flex flex-col gap-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-lg font-semibold">
            <span
              aria-hidden="true"
              className="inline-block transition-transform group-open:rotate-90"
            >
              ›
            </span>
            Historique ({history.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {history.map((job) => (
              <JobRow key={job.id} job={job} disabled={disabled} onAction={onAction} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Counter({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number | string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-surface p-3 shadow-card">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`text-2xl font-semibold ${alert ? "text-danger" : ""}`}>{value}</dd>
    </div>
  );
}

function Section({
  title,
  count,
  alert = false,
  children,
}: {
  title: string;
  count: number;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className={`text-lg font-semibold ${alert ? "text-danger" : ""}`}>
        {title} ({count})
      </h2>
      <ul className="flex flex-col gap-3">{children}</ul>
    </section>
  );
}

function JobRow({
  job,
  position,
  disabled,
  onAction,
}: {
  job: PanelJob;
  /** Place in the queue, 1 for the next one to print. */
  position?: number;
  disabled: boolean;
  onAction: (action: OperatorAction) => void;
}) {
  const canStart = job.status === "PENDING" && !job.authorized;
  const canRetry = job.status === "STUCK" || job.status === "FAILED";
  const canCancel = canStart || canRetry;
  const problem = canRetry;
  const past = job.status === "DONE" || job.status === "CANCELLED";

  return (
    <li
      data-testid="job"
      className={`flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 shadow-card ${
        problem ? "ring-2 ring-danger" : ""
      } ${past ? "opacity-80" : ""}`}
    >
      {position !== undefined && (
        <span
          aria-label={`Position ${position}`}
          className={`flex size-9 shrink-0 items-center justify-center rounded-full font-semibold ${
            position === 1 ? "bg-accent text-on-accent" : "bg-accent-soft"
          }`}
        >
          {position}
        </span>
      )}

      {job.photoUrl ? (
        // Signed URLs expire within minutes: there is nothing to optimize.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={job.photoUrl}
          alt="Photo à imprimer"
          className="size-16 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-background text-center text-xs text-muted">
          Photo indisponible
        </div>
      )}

      <div className="min-w-32 flex-1">
        <p className={`font-semibold ${problem ? "text-danger" : ""}`}>
          {position === 1 && canStart
            ? "Prochaine à imprimer"
            : operatorStatusLabel(job)}
        </p>
        {job.frameText && (
          <p data-testid="job-frame-text" className="break-words text-sm font-semibold">
            « {job.frameText} »
          </p>
        )}
        <p className="text-sm text-muted">
          Demandée à {time.format(new Date(job.createdAt))}
        </p>
        {job.lastError && <p className="text-sm text-danger">{job.lastError}</p>}
      </div>

      {(canStart || canRetry || canCancel) && (
        <div className="flex flex-wrap gap-2">
          {canStart && (
            <Button
              variant={position === 1 ? "primary" : "secondary"}
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
              variant="ghost"
              disabled={disabled}
              onClick={() => onAction({ type: "cancel", jobId: job.id })}
            >
              Annuler
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

import { CheckIcon } from "@/components/ui/icons";
import { guestStatusLabel, PrintJobStatus } from "@/lib/print/job-status";

const steps = [
  "Demande envoyée",
  "Validation par l'équipe",
  "Impression",
  "Prête à récupérer",
] as const;

/** How far along each status is, on the four steps above. */
const reached: Record<PrintJobStatus, number> = {
  PENDING: 1,
  PRINTING: 2,
  DONE: 3,
  STUCK: 2,
  FAILED: 2,
  CANCELLED: 0,
};

/**
 * The print's progress as steps a guest understands at a glance, plus the
 * plain sentence of SCRUM-22. Never a raw status (UX rule 2).
 */
export function PrintSteps({ status }: { status: PrintJobStatus }) {
  const problem = status === "STUCK" || status === "FAILED";
  const current = reached[status];

  if (status === "CANCELLED") {
    return <p className="text-muted">{guestStatusLabel(status)}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ol aria-label="Étapes de l'impression" className="flex flex-col gap-2">
        {steps.map((label, index) => {
          const done = index < current || (status === "DONE" && index === current);
          const active = index === current && status !== "DONE";
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${
                  done
                    ? "border-success bg-success text-surface"
                    : active
                      ? problem
                        ? "border-danger text-danger"
                        : "animate-soft-pulse border-accent bg-accent-soft"
                      : "border-divider"
                }`}
              >
                {done ? <CheckIcon size={16} strokeWidth={3} /> : active && problem ? "!" : null}
              </span>
              <span
                className={
                  done || active ? "font-semibold" : "text-muted"
                }
              >
                {label}
                {done && <span className="sr-only"> : fait</span>}
                {active && <span className="sr-only"> : en cours</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p
        role="status"
        aria-live="polite"
        className={
          problem
            ? "font-semibold text-danger"
            : status === "DONE"
              ? "font-semibold text-success"
              : "text-foreground"
        }
      >
        {guestStatusLabel(status)}
      </p>
    </div>
  );
}

export type PrintJobStatus =
  | "PENDING"
  | "PRINTING"
  | "DONE"
  | "STUCK"
  | "FAILED";

const guestLabels: Record<PrintJobStatus, string> = {
  PENDING: "En attente de validation par l'équipe",
  PRINTING: "Impression en cours",
  DONE: "Votre photo est prête, à récupérer près de l'imprimante",
  STUCK: "Un souci est survenu, rendez-vous auprès de l'équipe",
  FAILED: "Un souci est survenu, rendez-vous auprès de l'équipe",
};

/** The only text a guest may see about a job: never the raw status. */
export function guestStatusLabel(status: PrintJobStatus): string {
  return guestLabels[status];
}

export const MAX_NAME_LENGTH = 120;

export interface CreateEventInput {
  name: string;
  /** "YYYY-MM-DD", or empty. */
  date: string;
  /** Drawn once by the form: a double tap or a retry gives the same event. */
  creationKey: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checked here for a clear message, and again by the database. */
export function validateEventInput(input: CreateEventInput): string | null {
  const name = input.name.trim();
  if (!name) return "Donnez un nom à l'événement.";
  if (name.length > MAX_NAME_LENGTH) {
    return `Le nom est trop long (${MAX_NAME_LENGTH} caractères au plus).`;
  }
  if (input.date && (!DATE.test(input.date) || Number.isNaN(Date.parse(input.date)))) {
    return "La date n'est pas valable.";
  }
  if (!UUID.test(input.creationKey)) return "La demande n'est pas valable. Rechargez la page.";
  return null;
}

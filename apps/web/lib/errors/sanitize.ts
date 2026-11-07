/** A looping error must not drain a guest's battery or data plan. */
export const MAX_REPORTS_PER_PAGE = 5;

/**
 * Removes anything secret or personal before an error leaves the phone: the
 * event and operator links carry secret tokens, and long strings mixing letters
 * and digits may be tokens or ids.
 */
export function sanitize(text: string): string {
  return text
    .replace(/\/(e|operateur)\/[^/\s?#"')]+/g, "/$1/[lien]")
    // Tokens and ids mix letters and digits; error codes such as
    // "anonymous_provider_disabled" are words and stay readable.
    .replace(/(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}/g, "[masqué]")
    .slice(0, 500);
}


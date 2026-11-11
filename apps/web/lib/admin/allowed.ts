import type { User } from "@supabase/supabase-js";

/** ADMIN_EMAILS="a@x.fr, b@y.fr": the accounts allowed in the admin space. */
export function allowedEmails(raw = process.env.ADMIN_EMAILS ?? ""): string[] {
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * A guest's anonymous session, an unconfirmed email or an email outside the
 * list never opens the admin space.
 */
export function isAdmin(user: User | null, allowed = allowedEmails()): boolean {
  if (!user || user.is_anonymous || !user.email || !user.email_confirmed_at) {
    return false;
  }
  return allowed.includes(user.email.toLowerCase());
}

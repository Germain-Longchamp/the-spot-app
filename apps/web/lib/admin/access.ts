import { isAdmin } from "@/lib/admin/allowed";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type AdminSession =
  | { kind: "signed_out" }
  | { kind: "not_allowed"; email: string | null }
  | { kind: "admin"; user: User };

/**
 * Reads the session from the cookie and checks it with Supabase (getUser, not
 * getSession: a forged cookie is rejected). Any failure means no access.
 */
export async function adminSession(): Promise<AdminSession> {
  try {
    const { data, error } = await createClient().auth.getUser();
    const user = error ? null : data.user;
    if (!user || user.is_anonymous) return { kind: "signed_out" };
    if (!isAdmin(user)) return { kind: "not_allowed", email: user.email ?? null };
    return { kind: "admin", user };
  } catch {
    return { kind: "signed_out" };
  }
}

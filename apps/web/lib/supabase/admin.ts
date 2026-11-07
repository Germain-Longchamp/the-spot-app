import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Bypasses RLS. Server code only: "server-only" breaks the build if this file
 * ever reaches a browser bundle.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    // Seen on 2026-11-04: the panel answered 404 and nothing said why. This
    // line lands in the server logs (Vercel), never in front of a visitor.
    console.error("[the-spot] SUPABASE_SERVICE_ROLE_KEY manquante : le panneau opérateur ne peut pas lire la base.");
    throw new Error("Variable d'environnement manquante : SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}

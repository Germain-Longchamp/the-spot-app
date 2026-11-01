import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export function hashOperatorToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Returns the event this link opens, or null. Any failure means no access:
 * a broken connection must never open the panel.
 */
export async function findEventForToken(
  client: SupabaseClient,
  token: string
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from("event_operator_tokens")
      .select("event_id")
      .eq("token_hash", hashOperatorToken(token))
      .maybeSingle();
    return error || !data ? null : (data.event_id as string);
  } catch {
    return null;
  }
}

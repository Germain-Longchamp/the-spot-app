"use server";

import { findEventForToken } from "@/lib/operator/access";
import { OperatorAction, runOperatorAction } from "@/lib/operator/actions";
import { createAdminClient } from "@/lib/supabase/admin";

/** The link is checked on every action, not only when the page opens. */
export async function operatorAction(
  token: string,
  action: OperatorAction
): Promise<string> {
  const client = createAdminClient();
  const eventId = await findEventForToken(client, token);
  if (!eventId) return "Accès refusé.";
  return runOperatorAction(client, eventId, action);
}

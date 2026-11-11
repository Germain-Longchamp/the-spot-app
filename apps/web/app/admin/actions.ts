"use server";

import { adminSession } from "@/lib/admin/access";
import {
  createEvent,
  CreateEventInput,
  CreateEventResult,
  resetOperatorLink,
} from "@/lib/admin/events";
import { createAdminClient } from "@/lib/supabase/admin";

/** The session is checked on every action, not only when the page opens. */
export async function createEventAction(
  input: CreateEventInput,
): Promise<CreateEventResult | { kind: "denied" }> {
  const session = await adminSession();
  if (session.kind !== "admin") return { kind: "denied" };
  return createEvent(createAdminClient(), session.user.id, input);
}

export async function resetOperatorLinkAction(
  eventId: string,
): Promise<{ operatorPath: string } | { kind: "denied" } | null> {
  const session = await adminSession();
  if (session.kind !== "admin") return { kind: "denied" };
  return resetOperatorLink(createAdminClient(), session.user.id, eventId);
}

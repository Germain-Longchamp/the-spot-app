import { randomBytes, randomInt } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CreateEventInput, UUID, validateEventInput } from "@/lib/admin/events-input";
import { hashOperatorToken } from "@/lib/operator/access";

export type { CreateEventInput };

// Same rules as scripts/event-lib.mjs. No 0/O or 1/I/L: the code is read on a
// poster and typed on a phone.
const SHORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SHORT_CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

export const generateAccessToken = () => randomBytes(32).toString("base64url");
export const generateOperatorToken = () => randomBytes(32).toString("base64url");

export function generateShortCode(): string {
  return Array.from(
    { length: SHORT_CODE_LENGTH },
    () => SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)],
  ).join("");
}

export interface AdminEvent {
  id: string;
  name: string;
  eventDate: string | null;
  open: boolean;
  accessPath: string;
  shortCode: string;
  createdAt: string;
}

export type CreateEventResult =
  | { kind: "created" | "existing"; event: AdminEvent; operatorPath: string }
  | { kind: "invalid"; message: string }
  | { kind: "error" };

interface EventRow {
  id: string;
  name: string;
  event_date: string | null;
  status: string;
  access_token: string;
  short_code: string;
  created_at: string;
}

const COLUMNS = "id, name, event_date, status, access_token, short_code, created_at";

function toAdminEvent(row: EventRow): AdminEvent {
  return {
    id: row.id,
    name: row.name,
    eventDate: row.event_date,
    open: row.status === "open",
    accessPath: `/e/${row.access_token}`,
    shortCode: row.short_code,
    createdAt: row.created_at,
  };
}

/** Upcoming and recent first: by date, then by creation, newest first. */
export async function listEvents(client: SupabaseClient): Promise<AdminEvent[]> {
  const { data, error } = await client
    .from("events")
    .select(COLUMNS)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data as EventRow[]).map(toAdminEvent);
}

/**
 * Creates the event and its operator link. The operator link is returned once,
 * here: only its hash is stored. Retried with new codes on a collision.
 */
export async function createEvent(
  client: SupabaseClient,
  adminUserId: string,
  input: CreateEventInput,
): Promise<CreateEventResult> {
  const message = validateEventInput(input);
  if (message) return { kind: "invalid", message };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const operatorToken = generateOperatorToken();
    const { data, error } = await client.rpc("admin_create_event", {
      p_admin_user_id: adminUserId,
      p_creation_key: input.creationKey,
      p_name: input.name.trim(),
      p_event_date: input.date || null,
      p_access_token: generateAccessToken(),
      p_short_code: generateShortCode(),
      p_operator_token_hash: hashOperatorToken(operatorToken),
    });
    if (error) return { kind: "error" };
    if (data?.result === "collision") continue;
    if (data?.result === "invalid") {
      return { kind: "invalid", message: "Donnez un nom à l'événement." };
    }
    if (data?.result !== "created" && data?.result !== "existing") return { kind: "error" };

    const row = await client.from("events").select(COLUMNS).eq("id", data.event_id).single();
    if (row.error) return { kind: "error" };
    return {
      kind: data.result,
      event: toAdminEvent(row.data as EventRow),
      operatorPath: `/operateur/${operatorToken}`,
    };
  }
  return { kind: "error" };
}

/** A new operator link: the old one stops working at once. */
export async function resetOperatorLink(
  client: SupabaseClient,
  adminUserId: string,
  eventId: string,
): Promise<{ operatorPath: string } | null> {
  if (!UUID.test(eventId)) return null;
  const operatorToken = generateOperatorToken();
  const { data, error } = await client.rpc("admin_reset_operator_link", {
    p_admin_user_id: adminUserId,
    p_event_id: eventId,
    p_operator_token_hash: hashOperatorToken(operatorToken),
  });
  if (error || data?.result !== "applied") return null;
  return { operatorPath: `/operateur/${operatorToken}` };
}

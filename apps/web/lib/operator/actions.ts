import type { SupabaseClient } from "@supabase/supabase-js";

export type OperatorAction =
  | { type: "start" | "retry" | "cancel"; jobId: string }
  | { type: "pause" | "resume" };

const messages: Record<string, string> = {
  started: "Impression lancée.",
  busy: "Une impression est déjà en cours. Attendez sa fin pour lancer la suivante.",
  paused: "Les impressions sont en pause. Reprenez-les pour lancer celle-ci.",
  agent_offline:
    "L'imprimante n'est pas connectée : impossible de lancer cette impression.",
  not_pending: "Cette demande a déjà été traitée.",
  refused: "Cette action n'est plus possible : la demande a changé d'état.",
  not_found: "Cette demande est introuvable.",
};

const applied: Record<OperatorAction["type"], string> = {
  start: "Impression lancée.",
  retry: "La demande est relancée.",
  cancel: "La demande est annulée.",
  pause: "Les impressions sont en pause.",
  resume: "Les impressions ont repris.",
};

const failure = "L'action n'a pas abouti. Réessayez dans un instant.";

function call(eventId: string, action: OperatorAction) {
  switch (action.type) {
    case "start":
      return {
        fn: "start_print_job",
        args: { p_event_id: eventId, p_job_id: action.jobId },
      };
    case "retry":
    case "cancel":
      return {
        fn: "operator_job_action",
        args: {
          p_event_id: eventId,
          p_job_id: action.jobId,
          p_action: action.type,
        },
      };
    case "pause":
    case "resume":
      return {
        fn: "set_printing_paused",
        args: { p_event_id: eventId, p_paused: action.type === "pause" },
      };
  }
}

/** Runs an action for one event, and returns the sentence to show the team. */
export async function runOperatorAction(
  client: SupabaseClient,
  eventId: string,
  action: OperatorAction
): Promise<string> {
  const { fn, args } = call(eventId, action);
  try {
    const { data, error } = await client.rpc(fn, args);
    if (error) return failure;
    const result = data?.result as string;
    if (result === "applied") return applied[action.type];
    return messages[result] ?? failure;
  } catch {
    return failure;
  }
}

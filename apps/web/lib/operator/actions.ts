import type { SupabaseClient } from "@supabase/supabase-js";

export type OperatorAction =
  | { type: "start" | "retry" | "cancel"; jobId: string }
  | { type: "pause" | "resume" }
  | { type: "delete_photo"; photoId: string };

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

const deletion: Record<string, string> = {
  applied: "La photo est supprimée : elle a disparu de la galerie.",
  already_deleted: "Cette photo n'existe plus : elle a déjà été supprimée.",
  print_in_progress:
    "Cette photo a une impression en attente ou à vérifier. Annulez-la ou attendez sa fin, puis supprimez la photo.",
  not_found: "Cette photo est introuvable.",
};

const filesLeft =
  "La photo a disparu de la galerie, mais son fichier n'a pas pu être effacé. Touchez de nouveau « Supprimer » pour finir.";

const applied: Record<OperatorAction["type"], string> = {
  start: "Impression lancée.",
  retry: "La demande est relancée.",
  cancel: "La demande est annulée.",
  pause: "Les impressions sont en pause.",
  resume: "Les impressions ont repris.",
  delete_photo: deletion.applied,
};

const failure = "L'action n'a pas abouti. Réessayez dans un instant.";

function call(
  eventId: string,
  action: Exclude<OperatorAction, { type: "delete_photo" }>,
) {
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
  action: OperatorAction,
): Promise<string> {
  if (action.type === "delete_photo") {
    return deletePhoto(client, eventId, action.photoId);
  }
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

/**
 * Removes a photo from the gallery, then its files. The database answers with
 * the files to delete even when the photo was already gone, so a deletion that
 * failed halfway finishes on the next try.
 */
async function deletePhoto(
  client: SupabaseClient,
  eventId: string,
  photoId: string,
): Promise<string> {
  try {
    const { data, error } = await client.rpc("operator_delete_photo", {
      p_event_id: eventId,
      p_photo_id: photoId,
    });
    if (error) return failure;
    const result = data?.result as string;
    const paths = (data?.paths ?? []) as string[];

    if (
      paths.length &&
      (result === "applied" || result === "already_deleted")
    ) {
      const removed = await client.storage.from("photos").remove(paths);
      if (removed.error) return filesLeft;
    }
    return deletion[result] ?? failure;
  } catch {
    return failure;
  }
}

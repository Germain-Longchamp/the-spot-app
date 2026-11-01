import type { SupabaseClient } from "@supabase/supabase-js";

export type PrintRequestOutcome =
  | "created"
  | "print_limit_reached"
  | "request_cancelled"
  | "printing_paused"
  | "event_closed"
  | "photo_not_found"
  | "connection_lost"
  | "unexpected_error";

export const printRequestMessages: Record<PrintRequestOutcome, string> = {
  created: "C'est noté ! L'équipe va lancer l'impression de votre photo.",
  print_limit_reached:
    "Le nombre maximum d'impressions de cet événement est atteint.",
  request_cancelled:
    "Votre demande a été annulée par l'équipe. Vous pouvez en refaire une.",
  printing_paused:
    "Les impressions sont en pause pour le moment. Merci de patienter quelques instants, puis réessayez.",
  event_closed:
    "Cet événement est terminé : les impressions ne sont plus possibles.",
  photo_not_found:
    "Cette photo n'est plus disponible. Reprenez-en une pour l'imprimer.",
  connection_lost:
    "Nous n'avons pas pu confirmer votre demande. Vérifiez votre connexion, puis réessayez : votre photo ne sera pas imprimée deux fois.",
  unexpected_error:
    "Un souci est survenu de notre côté. Réessayez dans un instant.",
};

/** The guest can try again: the same key can never create a second job. */
export function canRetry(outcome: PrintRequestOutcome): boolean {
  return (
    outcome === "printing_paused" ||
    outcome === "request_cancelled" ||
    outcome === "connection_lost" ||
    outcome === "unexpected_error"
  );
}

const knownResults: readonly string[] = [
  "created",
  "print_limit_reached",
  "request_cancelled",
  "printing_paused",
  "event_closed",
  "photo_not_found",
];

export async function requestPrint(
  supabase: SupabaseClient,
  photoId: string,
  idempotencyKey: string
): Promise<PrintRequestOutcome> {
  try {
    const { data, error, status } = await supabase.rpc("create_print_job", {
      p_photo_id: photoId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      // Status 0 means no HTTP response ever came back: a failed fetch.
      return status === 0 ? "connection_lost" : "unexpected_error";
    }
    return knownResults.includes(data?.result)
      ? (data.result as PrintRequestOutcome)
      : "unexpected_error";
  } catch {
    return "connection_lost";
  }
}

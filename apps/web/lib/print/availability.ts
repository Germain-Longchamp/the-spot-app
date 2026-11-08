/** What get_print_availability answers, in the guest's words. */
export const unavailableMessages: Record<string, string> = {
  paused:
    "Les impressions sont en pause pour le moment. Merci de patienter quelques instants.",
  limit_reached:
    "Le nombre maximum d'impressions de cet événement est atteint.",
  closed: "Cet événement est terminé : les impressions ne sont plus possibles.",
};

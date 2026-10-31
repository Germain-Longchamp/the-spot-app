export function validateRequiredEnv(
  vars: Record<string, string | undefined>
): void {
  const missing = Object.entries(vars)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `Variables d'environnement manquantes : ${missing.join(", ")}\n` +
        "Copiez .env.example vers .env.local et renseignez les valeurs."
    );
  }
}

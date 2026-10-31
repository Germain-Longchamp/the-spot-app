// Print agent entry point — full implementation in SCRUM-21 to SCRUM-24.
// This file is a placeholder that validates env vars at startup.

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `[print-agent] Variables d'environnement manquantes : ${missing.join(", ")}`
  );
  process.exit(1);
}

console.log("[print-agent] Démarrage — en attente d'implémentation (SCRUM-21).");

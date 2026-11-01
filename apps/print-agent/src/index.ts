import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "./config";
import { SimulatedPrinter } from "./printer";
import { SupabaseJobStore, SupabaseLike } from "./supabase-store";
import { Logger, runAgent } from "./worker";

const log: Logger = {
  info: (message) =>
    console.log(`${new Date().toISOString()} [agent] ${message}`),
  error: (message) =>
    console.error(`${new Date().toISOString()} [agent] ${message}`),
};

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info(`${signal} reçu : arrêt après le job en cours`);
    stopping = true;
  });
}

async function main() {
  const config = loadConfig(process.env);
  const client = createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    { auth: { persistSession: false } }
  );

  log.info(`démarrage de ${config.agentId}`);

  await runAgent(
    {
      // The generated client types are wider than the few calls we make.
      store: new SupabaseJobStore(client as unknown as SupabaseLike, {
        eventId: config.eventId,
        agentId: config.agentId,
        bucket: config.bucket,
        downloadTimeoutMs: 10_000,
      }),
      printer: new SimulatedPrinter({
        delayMs: config.simulatedDelayMs,
        outcome: config.simulatedOutcome,
      }),
      log,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      printOptions: { copies: 1 },
      shouldStop: () => stopping,
      // Three tries stay well under the 60 seconds before a job goes STUCK.
      downloadAttempts: 3,
      retryDelayMs: 2000,
      maxRetryDelayMs: 30_000,
    },
    config.pollIntervalMs
  );

  log.info("arrêté");
}

main().catch((error: Error) => {
  log.error(error.message);
  process.exit(1);
});

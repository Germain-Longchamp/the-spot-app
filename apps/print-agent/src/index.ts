import { createClient } from "@supabase/supabase-js";
import { composePage } from "./compose";
import { loadConfig } from "./config";
import { SimulatedPrinter } from "./printer";
import { SupabaseJobStore, SupabaseLike } from "./supabase-store";
import { AgentLogger, createLogger, ErrorSink, Logger } from "./logger";
import { runAgent, runHeartbeat, WorkerDeps } from "./worker";

// Until the configuration is read, lines go to the console only.
let log: Logger = {
  info: (message) => console.log(JSON.stringify({ level: "info", message })),
  error: (message) => console.error(JSON.stringify({ level: "error", message })),
};

const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info(`${signal} reçu : arrêt après le job en cours`);
    stop.abort();
  });
}

/** Waits, unless the agent is asked to stop. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    stop.signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const config = loadConfig(process.env);
  const client = createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    { auth: { persistSession: false } }
  );
  const agentLog: AgentLogger = createLogger({
    agentId: config.agentId,
    eventId: config.eventId,
    dir: config.logDir,
  });
  log = agentLog;

  // Errors also go to the shared table, read with scripts/recent-errors.mjs.
  const sink: ErrorSink = async (entries) => {
    const { error } = await client.from("app_errors").insert(
      entries.map((entry) => ({
        source: "agent",
        event_id: entry.eventId,
        job_id: entry.jobId,
        screen: entry.agentId,
        message: entry.message,
      }))
    );
    if (error) throw new Error(error.message);
  };

  log.info(`démarrage de ${config.agentId}`);

  const deps: WorkerDeps = {
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
      log: agentLog,
      sleep,
      printOptions: { copies: 1 },
      compose: (image, job) =>
        composePage(image, { crop: job.crop ?? null, landscape: config.pageLandscape }),
      activeJob: { current: null },
      shouldStop: () => stop.signal.aborted,
      // Three tries stay well under the 60 seconds before a job goes STUCK.
      downloadAttempts: 3,
      retryDelayMs: 2000,
      maxRetryDelayMs: 30_000,
  };

  async function runErrorFlush() {
    while (!stop.signal.aborted) {
      await agentLog.flush(sink);
      await sleep(config.heartbeatIntervalMs);
    }
    await agentLog.flush(sink);
  }

  await Promise.all([
    runAgent(deps, config.pollIntervalMs),
    runHeartbeat(deps, config.heartbeatIntervalMs),
    runErrorFlush(),
  ]);

  log.info("arrêté", {});
}

main().catch((error: Error) => {
  log.error(error.message);
  process.exit(1);
});

import { test, expect } from "@playwright/test";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createLogger, ErrorEntry } from "../../print-agent/src/logger";
import {
  ClaimedJob,
  ImageUnavailableError,
  JobStore,
  processNextJob,
  WorkerDeps,
} from "../../print-agent/src/worker";
import { SimulatedPrinter } from "../../print-agent/src/printer";

const quiet = { log: () => {}, error: () => {} };

function logger(extra: Partial<Parameters<typeof createLogger>[0]> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "agent-log-"));
  const log = createLogger({
    agentId: "salon-1",
    eventId: "event-1",
    dir,
    console: quiet,
    ...extra,
  });
  return { log, dir };
}

const lines = (dir: string) =>
  readFileSync(join(dir, "agent.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("chaque ligne est un objet JSON avec l'heure, l'agent, l'événement et le job", () => {
  const { log, dir } = logger();

  log.info("job j1: tentative 1", { jobId: "j1" });
  log.error("job j1: impression en échec", { jobId: "j1", reason: "Papier épuisé" });

  const [first, second] = lines(dir);
  expect(first).toMatchObject({ level: "info", agent: "salon-1", event: "event-1", job: "j1" });
  expect(new Date(first.time).toString()).not.toBe("Invalid Date");
  expect(second).toMatchObject({ level: "error", job: "j1", reason: "Papier épuisé" });
});

test("le fichier tourne avant de remplir le disque", () => {
  const { log, dir } = logger({ maxBytes: 2_000, maxFiles: 3 });

  for (let i = 0; i < 200; i++) log.info(`ligne ${i} ${"x".repeat(50)}`);

  const files = readdirSync(dir).sort();
  expect(files).toEqual(["agent.log", "agent.log.1", "agent.log.2", "agent.log.3"].slice(0, files.length));
  expect(files.length).toBeLessThanOrEqual(4);
  for (const file of files) expect(statSync(join(dir, file)).size).toBeLessThan(2_200);
});

/**
 * Cas limite : pas de connexion Internet, l'agent garde ses erreurs et les
 * envoie au retour du réseau.
 */
test("hors réseau, les erreurs attendent et partent au retour", async () => {
  const { log } = logger();
  const sent: ErrorEntry[] = [];
  let online = false;
  const sink = async (entries: ErrorEntry[]) => {
    if (!online) throw new Error("offline");
    sent.push(...entries);
  };

  log.error("impossible de joindre le serveur");
  log.error("job j2: impression en échec", { jobId: "j2", reason: "Bourrage" });
  await log.flush(sink);
  expect(log.pending()).toBe(2);

  online = true;
  await log.flush(sink);

  expect(log.pending()).toBe(0);
  expect(sent.map((e) => [e.jobId, e.message])).toEqual([
    [null, "impossible de joindre le serveur"],
    ["j2", "job j2: impression en échec : Bourrage"],
  ]);
  expect(sent[0]).toMatchObject({ agentId: "salon-1", eventId: "event-1" });
});

test("une boucle d'erreurs n'inonde pas la base", async () => {
  const { log } = logger({ maxSentPerMinute: 5, maxQueued: 50, now: () => new Date("2026-11-07T10:00:00Z") });
  const sent: ErrorEntry[] = [];

  for (let i = 0; i < 80; i++) log.error(`erreur ${i}`);
  await log.flush(async (entries) => {
    sent.push(...entries);
  });

  expect(sent).toHaveLength(5);
  expect(log.pending()).toBe(45);
});

test("au-delà de la file, les plus anciennes sont perdues et c'est dit", async () => {
  const { log } = logger({ maxQueued: 3 });
  const sent: ErrorEntry[] = [];

  for (let i = 0; i < 5; i++) log.error(`erreur ${i}`);
  await log.flush(async (entries) => {
    sent.push(...entries);
  });

  expect(sent.map((e) => e.message)).toEqual([
    "erreur 2",
    "erreur 3",
    "erreur 4",
    "2 erreurs perdues : trop d'erreurs pendant la coupure",
  ]);
});

/**
 * Scenario: Erreur côté agent
 *   Given l'agent échoue à imprimer un job
 *   Then elle est journalisée avec le job et le motif
 */
test("un job en échec est journalisé avec le job et le motif, sans chemin de photo", async () => {
  const { log, dir } = logger();
  const job: ClaimedJob = { jobId: "job-42", attempt: 1, storagePath: "event/guest/photo.jpg" };
  const store: JobStore = {
    claim: async () => job,
    isCurrent: async () => true,
    downloadImage: async () => {
      throw new ImageUnavailableError("la photo n'est plus disponible");
    },
    report: async () => "FAILED",
    heartbeat: async () => {},
  };
  const deps: WorkerDeps = {
    store,
    printer: new SimulatedPrinter({ delayMs: 0, outcome: "success" }),
    log,
    sleep: async () => {},
    printOptions: { copies: 1 },
    // The page itself is tested in print-layout.spec.ts: here, as is.
    compose: async (image) => image,
    activeJob: { current: null },
    shouldStop: () => false,
    downloadAttempts: 1,
    retryDelayMs: 0,
    maxRetryDelayMs: 0,
  };

  expect(await processNextJob(deps)).toBe("failed");

  const failure = lines(dir).find((l) => l.level === "error");
  expect(failure).toMatchObject({ job: "job-42", reason: "Image introuvable : la photo n'est plus disponible" });
  expect(readFileSync(join(dir, "agent.log"), "utf8")).not.toContain("photo.jpg");
  expect(log.pending()).toBe(1);
});

import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { loadConfig } from "../../print-agent/src/config";
import {
  Printer,
  PrintResult,
  SimulatedPrinter,
} from "../../print-agent/src/printer";
import {
  SupabaseJobStore,
  SupabaseLike,
} from "../../print-agent/src/supabase-store";
import {
  ClaimedJob,
  ImageUnavailableError,
  JobReport,
  JobStore,
  processNextJob,
  runAgent,
  runHeartbeat,
  WorkerDeps,
} from "../../print-agent/src/worker";
import { Fixture, TestDb } from "./support/test-db";

let db: TestDb;

test.beforeAll(async () => {
  // Starting Postgres alongside the dev server can take over 30 s on a busy machine.
  test.setTimeout(120_000);
  db = await TestDb.start();
});

test.afterAll(async () => {
  await db?.stop();
});

const IMAGE = Buffer.from("photo");

/** The real SQL behind the agent; only the file download is faked. */
class DbStore implements JobStore {
  downloads = 0;
  onDownload: () => Promise<Buffer> = async () => IMAGE;

  constructor(
    private readonly eventId: string,
    private readonly agentId = "agent-test"
  ) {}

  async claim(): Promise<ClaimedJob | null> {
    const data = await db.service<Record<string, unknown>>(
      "claim_print_job",
      this.eventId,
      this.agentId
    );
    if (data.result !== "claimed") return null;
    return {
      jobId: data.job_id as string,
      attempt: data.attempt as number,
      storagePath: data.storage_path as string,
    };
  }

  async isCurrent(job: ClaimedJob) {
    const row = await jobRow(job.jobId);
    return row.status === "PRINTING" && row.attempt === job.attempt;
  }

  async downloadImage() {
    this.downloads++;
    return this.onDownload();
  }

  async report(job: ClaimedJob, status: JobReport, detail?: string) {
    const answer = await db.service<{ result: string }>(
      "transition_print_job",
      job.jobId,
      status,
      "agent",
      job.attempt,
      this.agentId,
      detail ?? null
    );
    return answer.result;
  }

  async heartbeat(job: ClaimedJob | null) {
    await db.service(
      "record_agent_heartbeat",
      this.eventId,
      this.agentId,
      job?.jobId ?? null,
      job?.attempt ?? null
    );
  }
}

class CountingPrinter implements Printer {
  calls: Buffer[] = [];
  constructor(
    private readonly behaviour: () => Promise<PrintResult> = async () => ({
      ok: true,
    })
  ) {}
  async print(image: Buffer) {
    this.calls.push(image);
    return this.behaviour();
  }
}

const jobRow = async (id: string) =>
  (await db.admin.query("select * from public.print_jobs where id = $1", [id]))
    .rows[0];

const stick = (id: string) =>
  db.service("transition_print_job", id, "STUCK", "system");

const retry = (id: string) =>
  db.service("transition_print_job", id, "PENDING", "operator");

async function authorizedJob(f?: Fixture) {
  const fixture = f ?? (await db.seed({ limit: 5 }));
  const { job_id } = await db.createPrintJob(
    fixture.userId,
    fixture.photoId,
    randomUUID()
  );
  await db.admin.query(
    "update public.print_jobs set authorized_at = now() where id = $1",
    [job_id]
  );
  return { fixture, jobId: job_id as string };
}

function workerDeps(
  store: JobStore,
  printer: Printer,
  overrides: Partial<WorkerDeps> = {}
): WorkerDeps & { logs: string[] } {
  const logs: string[] = [];
  return {
    store,
    printer,
    log: { info: (m) => logs.push(m), error: (m) => logs.push(m) },
    sleep: async () => undefined,
    printOptions: { copies: 1 },
    activeJob: { current: null },
    shouldStop: () => false,
    downloadAttempts: 3,
    retryDelayMs: 1,
    maxRetryDelayMs: 4,
    logs,
    ...overrides,
  };
}

test.describe("traitement d'un job", () => {
  /**
   * Scenario: Traitement nominal
   *   Given un job PENDING autorisé existe
   *   When l'agent le récupère
   *   Then il télécharge l'image, appelle l'imprimante simulée
   *   And le job passe en PRINTING puis en DONE
   */
  test("traitement nominal", async () => {
    const { fixture, jobId } = await authorizedJob();
    const printer = new CountingPrinter();

    const outcome = await processNextJob(
      workerDeps(new DbStore(fixture.eventId), printer)
    );

    expect(outcome).toBe("done");
    expect(printer.calls).toEqual([IMAGE]);
    expect((await jobRow(jobId)).status).toBe("DONE");
  });

  test("le job est en PRINTING pendant l'impression", async () => {
    const { fixture, jobId } = await authorizedJob();
    let during = "";
    const printer = new CountingPrinter(async () => {
      during = (await jobRow(jobId)).status;
      return { ok: true };
    });

    await processNextJob(workerDeps(new DbStore(fixture.eventId), printer));

    expect(during).toBe("PRINTING");
  });

  test("sans job autorisé, l'agent n'imprime rien", async () => {
    const f = await db.seed();
    const printer = new CountingPrinter();

    const outcome = await processNextJob(
      workerDeps(new DbStore(f.eventId), printer)
    );

    expect(outcome).toBe("idle");
    expect(printer.calls).toHaveLength(0);
  });

  /**
   * Scenario: Échec simulé
   *   Given le simulateur est réglé pour échouer
   *   When l'agent traite un job
   *   Then le job passe en FAILED avec un motif
   */
  test("échec simulé", async () => {
    const { fixture, jobId } = await authorizedJob();

    await processNextJob(
      workerDeps(
        new DbStore(fixture.eventId),
        new SimulatedPrinter({ delayMs: 0, outcome: "failure" })
      )
    );

    expect(await jobRow(jobId)).toMatchObject({
      status: "FAILED",
      last_error: "Échec simulé de l'imprimante",
    });
  });

  test("le simulateur réussit aussi, avec son délai", async () => {
    const started = Date.now();
    const result = await new SimulatedPrinter({
      delayMs: 30,
      outcome: "success",
    }).print();

    expect(result).toEqual({ ok: true });
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });

  test("une exception de l'imprimante donne un job en FAILED", async () => {
    const { fixture, jobId } = await authorizedJob();
    const printer = new CountingPrinter(async () => {
      throw new Error("pilote absent");
    });

    await processNextJob(workerDeps(new DbStore(fixture.eventId), printer));

    expect(await jobRow(jobId)).toMatchObject({
      status: "FAILED",
      last_error: "Erreur de l'imprimante",
    });
  });
});

test.describe("image", () => {
  /**
   * Scenario: Image introuvable
   *   Given l'image du job n'est plus disponible
   *   When l'agent tente de la télécharger
   *   Then le job passe en FAILED avec un message explicite
   */
  test("image introuvable : FAILED, sans réessai ni impression", async () => {
    const { fixture, jobId } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    store.onDownload = async () => {
      throw new ImageUnavailableError("la photo n'est plus disponible");
    };
    const printer = new CountingPrinter();

    await processNextJob(workerDeps(store, printer));

    expect(store.downloads).toBe(1);
    expect(printer.calls).toHaveLength(0);
    expect(await jobRow(jobId)).toMatchObject({
      status: "FAILED",
      last_error: "Image introuvable : la photo n'est plus disponible",
    });
  });

  test("une image vide n'est pas imprimée", async () => {
    const { fixture, jobId } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    store.onDownload = async () => Buffer.alloc(0);
    const printer = new CountingPrinter();

    await processNextJob(workerDeps(store, printer));

    expect(printer.calls).toHaveLength(0);
    expect((await jobRow(jobId)).status).toBe("FAILED");
  });

  test("un téléchargement raté est réessayé", async () => {
    const { fixture, jobId } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    store.onDownload = async () => {
      if (store.downloads < 3) throw new Error("réseau");
      return IMAGE;
    };
    const printer = new CountingPrinter();

    await processNextJob(workerDeps(store, printer));

    expect(store.downloads).toBe(3);
    expect(printer.calls).toHaveLength(1);
    expect((await jobRow(jobId)).status).toBe("DONE");
  });

  test("après plusieurs échecs, le job passe en FAILED", async () => {
    const { fixture, jobId } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    store.onDownload = async () => {
      throw new Error("réseau");
    };
    const printer = new CountingPrinter();

    await processNextJob(workerDeps(store, printer));

    expect(store.downloads).toBe(3);
    expect(printer.calls).toHaveLength(0);
    expect(await jobRow(jobId)).toMatchObject({
      status: "FAILED",
      last_error: "Image impossible à télécharger",
    });
  });
});

test.describe("jamais deux impressions", () => {
  /**
   * Scenario: Redémarrage de l'agent
   *   Given l'agent redémarre en plein traitement
   *   When il redémarre
   *   Then le job n'est pas imprimé deux fois
   */
  test("redémarrage en plein traitement : aucune réimpression", async () => {
    const { fixture, jobId } = await authorizedJob();
    const first = new DbStore(fixture.eventId);

    // The first process prints, then dies before reporting.
    await first.claim();

    const restarted = new CountingPrinter();
    const deps = workerDeps(new DbStore(fixture.eventId), restarted);

    expect(await processNextJob(deps)).toBe("idle");

    await stick(jobId);
    expect(await processNextJob(deps)).toBe("idle");

    expect(restarted.calls).toHaveLength(0);
    expect((await jobRow(jobId)).status).toBe("STUCK");
  });

  test("seul un réessai de l'opérateur relance l'impression, une fois", async () => {
    const { fixture, jobId } = await authorizedJob();
    await new DbStore(fixture.eventId).claim();
    await stick(jobId);
    await retry(jobId);

    const printer = new CountingPrinter();
    const deps = workerDeps(new DbStore(fixture.eventId), printer);

    expect(await processNextJob(deps)).toBe("done");
    expect(await processNextJob(deps)).toBe("idle");

    expect(printer.calls).toHaveLength(1);
    expect(await jobRow(jobId)).toMatchObject({ status: "DONE", attempt: 2 });
  });

  test("deux agents simultanés : une seule impression", async () => {
    const { fixture, jobId } = await authorizedJob();
    const printer = new CountingPrinter();

    const outcomes = await Promise.all(
      ["agent-a", "agent-b", "agent-c"].map((agent) =>
        processNextJob(workerDeps(new DbStore(fixture.eventId, agent), printer))
      )
    );

    expect(outcomes.filter((o) => o === "done")).toHaveLength(1);
    expect(printer.calls).toHaveLength(1);
    expect((await jobRow(jobId)).status).toBe("DONE");
  });

  test("un job réessayé pendant le téléchargement n'est pas imprimé", async () => {
    const { fixture, jobId } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    store.onDownload = async () => {
      await stick(jobId);
      await retry(jobId);
      return IMAGE;
    };
    const printer = new CountingPrinter();

    const outcome = await processNextJob(workerDeps(store, printer));

    expect(outcome).toBe("abandoned");
    expect(printer.calls).toHaveLength(0);
    expect((await jobRow(jobId)).status).toBe("PENDING");
  });

  test("un job passé en STUCK pendant le téléchargement n'est pas imprimé", async () => {
    const { fixture, jobId } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    store.onDownload = async () => {
      await stick(jobId);
      return IMAGE;
    };
    const printer = new CountingPrinter();

    expect(await processNextJob(workerDeps(store, printer))).toBe("abandoned");
    expect(printer.calls).toHaveLength(0);
  });

  test("en cas de doute sur le job, l'agent n'imprime pas", async () => {
    const { fixture } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    store.isCurrent = async () => {
      throw new Error("réseau");
    };
    const printer = new CountingPrinter();

    expect(await processNextJob(workerDeps(store, printer))).toBe("abandoned");
    expect(printer.calls).toHaveLength(0);
  });
});

test.describe("connexion perdue", () => {
  /** Cas limite : perte de connexion, l'agent réessaie sans perdre de job. */
  test("un compte rendu perdu est renvoyé, sans réimprimer", async () => {
    const { fixture, jobId } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    const send = store.report.bind(store);
    let failures = 3;
    store.report = async (job, status, detail) => {
      if (failures-- > 0) throw new Error("réseau");
      return send(job, status, detail);
    };
    const printer = new CountingPrinter();

    expect(await processNextJob(workerDeps(store, printer))).toBe("done");

    expect(printer.calls).toHaveLength(1);
    expect((await jobRow(jobId)).status).toBe("DONE");
  });

  test("le DONE arrive après le passage en STUCK et il est accepté", async () => {
    const { fixture, jobId } = await authorizedJob();
    const printer = new CountingPrinter(async () => {
      await stick(jobId);
      return { ok: true };
    });

    await processNextJob(workerDeps(new DbStore(fixture.eventId), printer));

    expect((await jobRow(jobId)).status).toBe("DONE");
  });

  test("à l'arrêt, l'agent cesse de renvoyer son compte rendu", async () => {
    const { fixture } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    store.report = async () => {
      throw new Error("réseau");
    };
    let stopping = false;
    const deps = workerDeps(store, new CountingPrinter(), {
      shouldStop: () => stopping,
      sleep: async () => {
        stopping = true;
      },
    });

    expect(await processNextJob(deps)).toBe("done");
  });

  test("le daemon survit à une coupure puis traite le job", async () => {
    const { fixture, jobId } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    const claim = store.claim.bind(store);
    let failures = 2;
    store.claim = async () => {
      if (failures-- > 0) throw new Error("réseau");
      return claim();
    };
    const printer = new CountingPrinter();
    let rounds = 0;
    const deps = workerDeps(store, printer, {
      shouldStop: () => rounds++ >= 4,
    });

    await runAgent(deps, 1);

    expect(printer.calls).toHaveLength(1);
    expect((await jobRow(jobId)).status).toBe("DONE");
  });
});

test.describe("signal de vie", () => {
  const silence = (id: string) =>
    db.admin.query(
      `update public.print_jobs
       set last_activity_at = now() - interval '61 seconds' where id = $1`,
      [id]
    );

  /** Printing takes over a minute: the job must not go STUCK meanwhile. */
  test("une impression longue reste en PRINTING", async () => {
    const { fixture, jobId } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    let during = "";
    const deps = workerDeps(store, new CountingPrinter(async () => {
      await silence(jobId);
      await store.heartbeat(deps.activeJob.current);
      await db.service("mark_stuck_jobs");
      during = (await jobRow(jobId)).status;
      return { ok: true };
    }));

    await processNextJob(deps);

    expect(during).toBe("PRINTING");
    expect((await jobRow(jobId)).status).toBe("DONE");
  });

  /**
   * The restarted agent has the same name as the one that crashed: its signs
   * of life must not keep the old job alive, or it would never go STUCK.
   */
  test("après un plantage, le job passe en STUCK malgré le redémarrage", async () => {
    const { fixture, jobId } = await authorizedJob();
    await new DbStore(fixture.eventId).claim();
    await silence(jobId);

    const restarted = workerDeps(
      new DbStore(fixture.eventId),
      new CountingPrinter()
    );
    await restarted.store.heartbeat(restarted.activeJob.current);
    await db.service("mark_stuck_jobs");

    expect((await jobRow(jobId)).status).toBe("STUCK");
  });

  test("un job abandonné ne reste pas en vie", async () => {
    const { fixture, jobId } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    store.isCurrent = async () => {
      throw new Error("réseau");
    };
    const deps = workerDeps(store, new CountingPrinter());

    expect(await processNextJob(deps)).toBe("abandoned");

    expect(deps.activeJob.current).toBeNull();
    await silence(jobId);
    await store.heartbeat(deps.activeJob.current);
    await db.service("mark_stuck_jobs");
    expect((await jobRow(jobId)).status).toBe("STUCK");
  });

  test("le job actif est libéré après une impression", async () => {
    const { fixture } = await authorizedJob();
    const deps = workerDeps(new DbStore(fixture.eventId), new CountingPrinter());

    await processNextJob(deps);

    expect(deps.activeJob.current).toBeNull();
  });

  test("le signal survit à une coupure et continue", async () => {
    const f = await db.seed();
    const store = new DbStore(f.eventId);
    let calls = 0;
    store.heartbeat = async () => {
      calls++;
      if (calls === 1) throw new Error("réseau");
    };
    let ticks = 0;
    const deps = workerDeps(store, new CountingPrinter(), {
      shouldStop: () => ticks++ >= 3,
    });

    await runHeartbeat(deps, 1);

    expect(calls).toBe(3);
  });
});

test.describe("journaux", () => {
  test("aucun chemin de photo ni contenu d'image dans les journaux", async () => {
    const { fixture } = await authorizedJob();
    const store = new DbStore(fixture.eventId);
    const deps = workerDeps(store, new CountingPrinter());

    await processNextJob(deps);

    expect(deps.logs.length).toBeGreaterThan(0);
    expect(deps.logs.join("\n")).not.toContain("test/photo.jpg");
  });
});

test.describe("connexion à Supabase", () => {
  const job: ClaimedJob = { jobId: "j1", attempt: 2, storagePath: "e/p.jpg" };

  function fakeClient(options: {
    signed?: () => { data: { signedUrl: string } | null; error: unknown };
    rpc?: { data: unknown; error: unknown };
  }) {
    const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return options.rpc ?? { data: null, error: null };
      },
      storage: {
        from: () => ({
          createSignedUrl: async () =>
            options.signed?.() ?? {
              data: { signedUrl: "https://x/signed" },
              error: null,
            },
        }),
      },
    };
    return { client: client as unknown as SupabaseLike, rpcCalls };
  }

  const config = {
    eventId: "e1",
    agentId: "a1",
    bucket: "photos",
    downloadTimeoutMs: 1000,
  };

  test("un job pris est traduit pour le worker", async () => {
    const { client, rpcCalls } = fakeClient({
      rpc: {
        data: {
          result: "claimed",
          job_id: "j1",
          attempt: 2,
          storage_path: "e/p.jpg",
        },
        error: null,
      },
    });

    expect(await new SupabaseJobStore(client, config).claim()).toEqual(job);
    expect(rpcCalls[0]).toEqual({
      fn: "claim_print_job",
      args: { p_event_id: "e1", p_agent_id: "a1" },
    });
  });

  test("rien à prendre, ou serveur injoignable", async () => {
    const idle = fakeClient({ rpc: { data: { result: "busy" }, error: null } });
    expect(await new SupabaseJobStore(idle.client, config).claim()).toBeNull();

    const down = fakeClient({
      rpc: { data: null, error: { message: "fetch failed" } },
    });
    await expect(
      new SupabaseJobStore(down.client, config).claim()
    ).rejects.toThrow("fetch failed");
  });

  test("le compte rendu rappelle l'acteur et la tentative", async () => {
    const { client, rpcCalls } = fakeClient({
      rpc: { data: { result: "applied" }, error: null },
    });

    const answer = await new SupabaseJobStore(client, config).report(
      job,
      "FAILED",
      "Papier épuisé"
    );

    expect(answer).toBe("applied");
    expect(rpcCalls[0]).toEqual({
      fn: "transition_print_job",
      args: {
        p_job_id: "j1",
        p_to: "FAILED",
        p_actor: "agent",
        p_attempt: 2,
        p_agent_id: "a1",
        p_detail: "Papier épuisé",
      },
    });
  });

  test("le signal de vie précise l'agent et le job en cours", async () => {
    const { client, rpcCalls } = fakeClient({ rpc: { data: null, error: null } });
    const store = new SupabaseJobStore(client, config);

    await store.heartbeat(job);
    await store.heartbeat(null);

    expect(rpcCalls).toEqual([
      {
        fn: "record_agent_heartbeat",
        args: {
          p_event_id: "e1",
          p_agent_id: "a1",
          p_job_id: "j1",
          p_attempt: 2,
        },
      },
      {
        fn: "record_agent_heartbeat",
        args: {
          p_event_id: "e1",
          p_agent_id: "a1",
          p_job_id: null,
          p_attempt: null,
        },
      },
    ]);
  });

  /** Cas limite : URL signée expirée, nouvelle URL demandée. */
  test("chaque essai demande une nouvelle URL signée", async () => {
    let urls = 0;
    const { client } = fakeClient({
      signed: () => ({
        data: { signedUrl: `https://x/${++urls}` },
        error: null,
      }),
    });
    const seen: string[] = [];
    const fetchFn = (async (url: string) => {
      seen.push(url);
      return url.endsWith("/1")
        ? new Response("expirée", { status: 403 })
        : new Response("image");
    }) as unknown as typeof fetch;
    const store = new SupabaseJobStore(client, config, fetchFn);

    await expect(store.downloadImage("p.jpg")).rejects.not.toBeInstanceOf(
      ImageUnavailableError
    );
    expect((await store.downloadImage("p.jpg")).toString()).toBe("image");
    expect(seen).toEqual(["https://x/1", "https://x/2"]);
  });

  test("un fichier absent est une panne définitive", async () => {
    const missingFile = new SupabaseJobStore(
      fakeClient({}).client,
      config,
      (async () => new Response("", { status: 404 })) as unknown as typeof fetch
    );
    await expect(missingFile.downloadImage("p.jpg")).rejects.toBeInstanceOf(
      ImageUnavailableError
    );

    const noUrl = new SupabaseJobStore(
      fakeClient({
        signed: () => ({
          data: null,
          error: { message: "Object not found", status: 400 },
        }),
      }).client,
      config
    );
    await expect(noUrl.downloadImage("p.jpg")).rejects.toBeInstanceOf(
      ImageUnavailableError
    );
  });

  test("une erreur serveur reste temporaire", async () => {
    const store = new SupabaseJobStore(
      fakeClient({
        signed: () => ({
          data: null,
          error: { message: "indisponible", status: 503 },
        }),
      }).client,
      config
    );

    await expect(store.downloadImage("p.jpg")).rejects.not.toBeInstanceOf(
      ImageUnavailableError
    );
  });
});

test.describe("configuration", () => {
  test("une variable manquante est nommée", () => {
    expect(() => loadConfig({ SUPABASE_URL: "https://x" })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY, EVENT_ID/
    );
  });

  test("les réglages ont des valeurs par défaut", () => {
    const config = loadConfig({
      SUPABASE_URL: "https://x",
      SUPABASE_SERVICE_ROLE_KEY: "k",
      EVENT_ID: "e1",
      SIMULATED_PRINTER_OUTCOME: "failure",
    });

    expect(config).toMatchObject({
      bucket: "photos",
      pollIntervalMs: 2000,
      simulatedOutcome: "failure",
    });
    expect(config.agentId.length).toBeGreaterThan(0);
  });
});

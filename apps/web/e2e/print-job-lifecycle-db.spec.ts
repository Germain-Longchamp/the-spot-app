import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
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

type Status = "PENDING" | "PRINTING" | "DONE" | "STUCK" | "FAILED";
type Actor = "agent" | "operator" | "system";

interface Outcome {
  result: string;
  job_id?: string;
  attempt?: number;
}

const AGENT = "agent-test";

const claim = (eventId: string, agent = AGENT) =>
  db.service<Outcome>("claim_print_job", eventId, agent);

const transition = (
  jobId: string,
  to: Status,
  actor: Actor,
  attempt: number | null = null,
  detail: string | null = null
) =>
  db.service<Outcome>(
    "transition_print_job",
    jobId,
    to,
    actor,
    attempt,
    null,
    detail
  );

const job = async (id: string) =>
  (await db.admin.query("select * from public.print_jobs where id = $1", [id]))
    .rows[0];

const history = async (id: string) =>
  (
    await db.admin.query(
      `select from_status, to_status, actor, applied
       from public.print_job_events
       where job_id = $1 order by created_at, id`,
      [id]
    )
  ).rows;

/** Backdates the last sign of life, instead of waiting for 60 real seconds. */
const silenceFor = (id: string, seconds: number) =>
  db.admin.query(
    `update public.print_jobs
     set last_activity_at = now() - make_interval(secs => $2)
     where id = $1`,
    [id, seconds]
  );

async function pendingJob(f?: Fixture, authorized = true) {
  const fixture = f ?? (await db.seed({ quota: 5 }));
  const { job_id } = await db.createPrintJob(
    fixture.userId,
    fixture.photoId,
    randomUUID()
  );
  if (authorized) {
    await db.admin.query(
      "update public.print_jobs set authorized_at = now() where id = $1",
      [job_id]
    );
  }
  return { fixture, jobId: job_id as string, attempt: 0 };
}

async function printingJob() {
  const { fixture, jobId } = await pendingJob();
  const { attempt } = await claim(fixture.eventId);
  return { fixture, jobId, attempt: attempt as number };
}

/** Puts a job in any status, through the only legal path. */
async function jobIn(status: Status) {
  if (status === "PENDING") return pendingJob();
  const printing = await printingJob();
  if (status === "DONE" || status === "FAILED") {
    await transition(printing.jobId, status, "agent", printing.attempt);
  }
  if (status === "STUCK") {
    await transition(printing.jobId, "STUCK", "system");
  }
  return printing;
}

test.describe("cycle de vie", () => {
  /**
   * Scenario: Parcours nominal
   *   Given un job est en PENDING
   *   When l'agent le prend puis termine l'impression
   *   Then il passe en PRINTING puis en DONE avec horodatage
   */
  test("parcours nominal avec horodatage et historique", async () => {
    const { fixture, jobId } = await pendingJob();

    const claimed = await claim(fixture.eventId);
    expect(claimed).toMatchObject({
      result: "claimed",
      job_id: jobId,
      attempt: 1,
      photo_id: fixture.photoId,
      storage_path: "test/photo.jpg",
    });

    const printing = await job(jobId);
    expect(printing.status).toBe("PRINTING");
    expect(printing.started_at).not.toBeNull();
    expect(printing.claimed_by).toBe(AGENT);

    const done = await transition(jobId, "DONE", "agent", 1);
    expect(done.result).toBe("applied");

    const finished = await job(jobId);
    expect(finished.status).toBe("DONE");
    expect(finished.finished_at).not.toBeNull();

    expect(await history(jobId)).toEqual([
      { from_status: null, to_status: "PENDING", actor: "guest", applied: true },
      {
        from_status: "PENDING",
        to_status: "PRINTING",
        actor: "agent",
        applied: true,
      },
      {
        from_status: "PRINTING",
        to_status: "DONE",
        actor: "agent",
        applied: true,
      },
    ]);
  });

  test("un échec garde son motif", async () => {
    const { jobId, attempt } = await printingJob();
    await transition(jobId, "FAILED", "agent", attempt, "Papier épuisé");

    expect(await job(jobId)).toMatchObject({
      status: "FAILED",
      last_error: "Papier épuisé",
    });
  });
});

test.describe("prise d'un job", () => {
  test("un job non autorisé n'est jamais pris", async () => {
    const { fixture, jobId } = await pendingJob(undefined, false);

    expect((await claim(fixture.eventId)).result).toBe("empty");
    expect((await job(jobId)).status).toBe("PENDING");
  });

  test("les impressions en pause bloquent la prise", async () => {
    const { fixture, jobId } = await pendingJob();
    await db.admin.query(
      "update public.events set printing_paused = true where id = $1",
      [fixture.eventId]
    );

    expect((await claim(fixture.eventId)).result).toBe("paused");
    expect((await job(jobId)).status).toBe("PENDING");
  });

  test("les jobs sont pris dans l'ordre d'arrivée", async () => {
    const first = await pendingJob();
    await pendingJob(first.fixture);

    expect((await claim(first.fixture.eventId)).job_id).toBe(first.jobId);
  });

  /** Cas limite : deux agents tentent de prendre le même job. */
  test("agents simultanés : un seul job pris par un seul agent", async () => {
    const { fixture, jobId } = await pendingJob();
    await pendingJob(fixture);

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        claim(fixture.eventId, `agent-${i}`)
      )
    );

    const claimed = results.filter((r) => r.result === "claimed");
    expect(claimed).toHaveLength(1);
    expect(claimed[0].job_id).toBe(jobId);
    expect(results.filter((r) => r.result === "busy")).toHaveLength(7);

    const { rows } = await db.admin.query(
      `select count(*)::int as n from public.print_jobs
       where event_id = $1 and status = 'PRINTING'`,
      [fixture.eventId]
    );
    expect(rows[0].n).toBe(1);
  });

  test("un agent attend la fin de la prise en cours d'un autre", async () => {
    const { fixture } = await pendingJob();
    await pendingJob(fixture);

    // The first claim stays uncommitted while the second one starts, so the
    // second one cannot see it yet: only the lock can protect it.
    const { second } = await db.as("service_role", null, async (client) => {
      await client.query("select public.claim_print_job($1, $2)", [
        fixture.eventId,
        "agent-1",
      ]);
      const pending = claim(fixture.eventId, "agent-2");
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { second: pending };
    });

    expect((await second).result).toBe("busy");
  });

  test("un seul job en impression à la fois, par événement", async () => {
    const { fixture, jobId } = await pendingJob();
    await pendingJob(fixture);
    const other = await pendingJob();

    await claim(fixture.eventId);
    expect((await claim(fixture.eventId)).result).toBe("busy");
    expect((await claim(other.fixture.eventId)).result).toBe("claimed");

    await transition(jobId, "DONE", "agent", 1);
    expect((await claim(fixture.eventId)).result).toBe("claimed");
  });
});

test.describe("agent silencieux", () => {
  /**
   * Scenario: Agent silencieux
   *   Given un job est en PRINTING
   *   When l'agent n'a donné aucun signe de vie depuis 60 secondes
   *   Then le job passe en STUCK
   */
  test("après 60 secondes de silence, le job passe en STUCK", async () => {
    const { jobId } = await printingJob();
    await silenceFor(jobId, 61);

    await db.service("mark_stuck_jobs");

    expect((await job(jobId)).status).toBe("STUCK");
    expect((await history(jobId)).at(-1)).toEqual({
      from_status: "PRINTING",
      to_status: "STUCK",
      actor: "system",
      applied: true,
    });
  });

  test("avant 60 secondes, le job reste en PRINTING", async () => {
    const { jobId } = await printingJob();
    await silenceFor(jobId, 50);

    await db.service("mark_stuck_jobs");

    expect((await job(jobId)).status).toBe("PRINTING");
  });
});

test.describe("transitions interdites", () => {
  /**
   * Scenario: Transition interdite
   *   Given un job est en DONE
   *   When on tente de le repasser en PRINTING
   *   Then la transition est refusée
   */
  const forbidden: [Status, Status, Actor][] = [
    ["DONE", "PRINTING", "agent"],
    ["DONE", "PENDING", "operator"],
    ["DONE", "FAILED", "agent"],
    ["DONE", "STUCK", "system"],
    ["PENDING", "DONE", "agent"],
    ["PENDING", "FAILED", "agent"],
    ["PENDING", "STUCK", "system"],
    ["PRINTING", "PENDING", "operator"],
    ["STUCK", "PRINTING", "agent"],
    ["STUCK", "FAILED", "agent"],
    ["FAILED", "PRINTING", "agent"],
    ["FAILED", "DONE", "agent"],
    ["FAILED", "STUCK", "system"],
  ];

  for (const [from, to, actor] of forbidden) {
    test(`${from} vers ${to} est refusé`, async () => {
      const { jobId, attempt } = await jobIn(from);

      const outcome = await transition(jobId, to, actor, attempt);

      expect(outcome.result).toBe("refused");
      expect((await job(jobId)).status).toBe(from);
      expect((await history(jobId)).at(-1)).toMatchObject({
        to_status: to,
        applied: false,
      });
    });
  }

  test("seul l'acteur prévu peut déclencher une transition", async () => {
    const stuck = await jobIn("STUCK");
    expect(
      (await transition(stuck.jobId, "PENDING", "agent", stuck.attempt)).result
    ).toBe("refused");

    const printing = await printingJob();
    expect(
      (await transition(printing.jobId, "DONE", "operator", printing.attempt))
        .result
    ).toBe("refused");
    expect(
      (await transition(printing.jobId, "STUCK", "agent", printing.attempt))
        .result
    ).toBe("refused");
  });

  test("un job introuvable est signalé", async () => {
    const outcome = await transition(randomUUID(), "DONE", "agent", 1);
    expect(outcome.result).toBe("not_found");
  });
});

test.describe("réessai manuel", () => {
  /**
   * Scenario: Réessai manuel
   *   Given un job est en STUCK
   *   When l'opérateur demande un réessai
   *   Then il repasse en PENDING
   */
  for (const from of ["STUCK", "FAILED"] as const) {
    test(`un job ${from} repasse en PENDING puis peut être repris`, async () => {
      const { fixture, jobId } = await jobIn(from);

      const outcome = await transition(jobId, "PENDING", "operator");
      expect(outcome.result).toBe("applied");
      expect(await job(jobId)).toMatchObject({
        status: "PENDING",
        claimed_by: null,
        last_error: null,
        started_at: null,
        finished_at: null,
      });

      const again = await claim(fixture.eventId);
      expect(again).toMatchObject({
        result: "claimed",
        job_id: jobId,
        attempt: 2,
      });
    });
  }

  test("un réessai ne crée pas de job et ne consomme pas de quota", async () => {
    const { fixture, jobId } = await jobIn("STUCK");
    const before = await db.jobCount(fixture.guestId);

    await transition(jobId, "PENDING", "operator");

    expect(await db.jobCount(fixture.guestId)).toBe(before);
  });
});

/** Cas limite : réponse DONE tardive après un passage en STUCK. */
test.describe("DONE tardif", () => {
  test("sans réessai, il est accepté : la photo est sortie", async () => {
    const { jobId, attempt } = await printingJob();
    await silenceFor(jobId, 61);
    await db.service("mark_stuck_jobs");

    const late = await transition(jobId, "DONE", "agent", attempt);

    expect(late.result).toBe("applied");
    const finished = await job(jobId);
    expect(finished.status).toBe("DONE");
    expect(finished.finished_at).not.toBeNull();
  });

  test("après un réessai pas encore repris, il est ignoré et tracé", async () => {
    const { jobId, attempt } = await jobIn("STUCK");
    await transition(jobId, "PENDING", "operator");

    const late = await transition(jobId, "DONE", "agent", attempt);

    expect(late.result).toBe("refused");
    expect((await job(jobId)).status).toBe("PENDING");
    expect((await history(jobId)).at(-1)).toMatchObject({
      to_status: "DONE",
      actor: "agent",
      applied: false,
    });
  });

  test("après une reprise, il ne touche pas à la nouvelle tentative", async () => {
    const { fixture, jobId, attempt } = await jobIn("STUCK");
    await transition(jobId, "PENDING", "operator");
    await claim(fixture.eventId);

    const late = await transition(jobId, "DONE", "agent", attempt);

    expect(late.result).toBe("stale_attempt");
    expect(await job(jobId)).toMatchObject({ status: "PRINTING", attempt: 2 });
    expect((await history(jobId)).at(-1)).toMatchObject({ applied: false });
  });

  test("un agent doit toujours préciser sa tentative", async () => {
    const { jobId } = await printingJob();

    const outcome = await transition(jobId, "DONE", "agent");

    expect(outcome.result).toBe("stale_attempt");
    expect((await job(jobId)).status).toBe("PRINTING");
  });
});

test.describe("droits", () => {
  const calls: [string, string][] = [
    ["claim_print_job", "$1::uuid, 'x'"],
    [
      "transition_print_job",
      "$1::uuid, 'DONE', 'agent', 1, null::text, null::text",
    ],
    ["mark_stuck_jobs", ""],
  ];

  for (const [fn, args] of calls) {
    test(`un invité ne peut pas appeler ${fn}`, async () => {
      const f = await db.seed();

      for (const [role, user] of [
        ["authenticated", f.userId],
        ["anon", null],
      ] as const) {
        await expect(
          db.as(role, user, (client) =>
            client.query(
              `select public.${fn}(${args})`,
              args ? [randomUUID()] : []
            )
          )
        ).rejects.toThrow(/permission denied/);
      }
    });
  }

  test("un invité ne peut pas lire l'historique des jobs", async () => {
    const { fixture, jobId } = await pendingJob();
    expect(await history(jobId)).toHaveLength(1);

    await expect(
      db.as("authenticated", fixture.userId, (client) =>
        client.query("select * from public.print_job_events")
      )
    ).rejects.toThrow(/permission denied/);
  });
});

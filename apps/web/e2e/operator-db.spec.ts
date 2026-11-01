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

const online = (eventId: string) =>
  db.service("record_agent_heartbeat", eventId, "agent-test");

const start = (eventId: string, jobId: string) =>
  db.service<{ result: string }>("start_print_job", eventId, jobId);

const action = (eventId: string, jobId: string, name: string) =>
  db.service<{ result: string }>("operator_job_action", eventId, jobId, name);

async function request(f: Fixture) {
  const { job_id } = await db.createPrintJob(
    f.userId,
    f.photoId,
    randomUUID()
  );
  return job_id as string;
}

const job = async (id: string) =>
  (await db.admin.query("select * from public.print_jobs where id = $1", [id]))
    .rows[0];

const actions = async (eventId: string) =>
  (
    await db.admin.query(
      `select action, target_id from public.operator_actions
       where event_id = $1 order by created_at`,
      [eventId]
    )
  ).rows;

async function ready() {
  const f = await db.seed();
  await online(f.eventId);
  return f;
}

async function stuckJob(f: Fixture) {
  const id = await request(f);
  await start(f.eventId, id);
  await db.service("claim_print_job", f.eventId, "agent-test");
  await db.service("transition_print_job", id, "STUCK", "system");
  return id;
}

test.describe("lancer", () => {
  /**
   * Scenario: Lancer une impression
   *   Given plusieurs jobs sont en PENDING et aucune impression n'est en cours
   *   When l'opérateur lance le premier job
   *   Then ce job passe en PRINTING
   *   And les autres restent en attente
   */
  test("seul le job lancé part en impression", async () => {
    const f = await ready();
    const first = await request(f);
    const second = await request(f);

    expect((await start(f.eventId, first)).result).toBe("started");
    const claimed = await db.service<{ job_id: string }>(
      "claim_print_job",
      f.eventId,
      "agent-test"
    );

    expect(claimed.job_id).toBe(first);
    expect((await job(first)).status).toBe("PRINTING");
    expect(await job(second)).toMatchObject({
      status: "PENDING",
      authorized_at: null,
    });
  });

  /**
   * Scenario: Une seule impression à la fois
   *   Given un job est en PRINTING
   *   When l'opérateur tente d'en lancer un deuxième
   *   Then l'action est refusée avec un message clair
   */
  test("un deuxième lancement est refusé pendant une impression", async () => {
    const f = await ready();
    const first = await request(f);
    const second = await request(f);
    await start(f.eventId, first);
    await db.service("claim_print_job", f.eventId, "agent-test");

    expect((await start(f.eventId, second)).result).toBe("busy");
    expect((await job(second)).authorized_at).toBeNull();
  });

  test("un lancement pas encore pris par l'agent bloque aussi le suivant", async () => {
    const f = await ready();
    const first = await request(f);
    const second = await request(f);
    await start(f.eventId, first);

    expect((await start(f.eventId, second)).result).toBe("busy");
  });

  /** Cas limite : deux opérateurs agissent en même temps. */
  test("deux opérateurs simultanés : une seule action prise en compte", async () => {
    const f = await ready();
    const jobs = await Promise.all([request(f), request(f), request(f)]);

    const results = await Promise.all(jobs.map((id) => start(f.eventId, id)));

    expect(results.filter((r) => r.result === "started")).toHaveLength(1);
    expect(results.filter((r) => r.result === "busy")).toHaveLength(2);
  });

  /** Cas limite : agent hors ligne, lancement bloqué avec un message. */
  test("agent hors ligne : le lancement est bloqué", async () => {
    const f = await db.seed();
    const id = await request(f);

    expect((await start(f.eventId, id)).result).toBe("agent_offline");
    expect((await job(id)).authorized_at).toBeNull();
  });

  test("impressions en pause : le lancement est bloqué", async () => {
    const f = await ready();
    const id = await request(f);
    await db.service("set_printing_paused", f.eventId, true);

    expect((await start(f.eventId, id)).result).toBe("paused");
  });

  test("un job déjà traité ne se relance pas", async () => {
    const f = await ready();
    const id = await request(f);
    await action(f.eventId, id, "cancel");

    expect((await start(f.eventId, id)).result).toBe("not_pending");
  });
});

test.describe("pause", () => {
  /**
   * Scenario: Pause globale
   *   When l'opérateur met les impressions en pause
   *   Then les invités ne peuvent plus créer de demande
   */
  test("la pause empêche les demandes, la reprise les rétablit", async () => {
    const f = await ready();

    await db.service("set_printing_paused", f.eventId, true);
    const paused = await db.createPrintJob(f.userId, f.photoId, randomUUID());
    expect(paused.result).toBe("printing_paused");

    await db.service("set_printing_paused", f.eventId, false);
    const resumed = await db.createPrintJob(f.userId, f.photoId, randomUUID());
    expect(resumed.result).toBe("created");

    expect((await actions(f.eventId)).map((a) => a.action)).toEqual([
      "pause",
      "resume",
    ]);
  });
});

test.describe("réessayer", () => {
  /**
   * Scenario: Réessai
   *   Given un job est en STUCK
   *   When l'opérateur choisit "Réessayer"
   *   Then le job repasse en PENDING
   */
  test("un job bloqué repart et l'agent le reprend sans autre geste", async () => {
    const f = await ready();
    const id = await stuckJob(f);

    expect((await action(f.eventId, id, "retry")).result).toBe("applied");
    expect((await job(id)).status).toBe("PENDING");

    const claimed = await db.service<{ job_id: string; attempt: number }>(
      "claim_print_job",
      f.eventId,
      "agent-test"
    );
    expect(claimed).toMatchObject({ job_id: id, attempt: 2 });
  });

  test("un job en impression ne se réessaie pas", async () => {
    const f = await ready();
    const id = await request(f);
    await start(f.eventId, id);
    await db.service("claim_print_job", f.eventId, "agent-test");

    expect((await action(f.eventId, id, "retry")).result).toBe("refused");
  });
});

test.describe("annuler", () => {
  test("annuler une demande rend l'impression au quota", async () => {
    const f = await db.seed({ limit: 1 });
    const id = await request(f);
    const blocked = await db.createPrintJob(f.userId, f.photoId, randomUUID());
    expect(blocked.result).toBe("print_limit_reached");

    expect((await action(f.eventId, id, "cancel")).result).toBe("applied");

    const again = await db.createPrintJob(f.userId, f.photoId, randomUUID());
    expect(again.result).toBe("created");
    expect((await job(id)).status).toBe("CANCELLED");
  });

  test("un job bloqué peut être annulé", async () => {
    const f = await ready();
    const id = await stuckJob(f);

    expect((await action(f.eventId, id, "cancel")).result).toBe("applied");
  });

  /** Cas limite : job annulé alors que l'impression a déjà démarré. */
  test("une impression déjà démarrée ne s'annule pas", async () => {
    const f = await ready();
    const id = await request(f);
    await start(f.eventId, id);
    await db.service("claim_print_job", f.eventId, "agent-test");

    expect((await action(f.eventId, id, "cancel")).result).toBe("refused");
    expect((await job(id)).status).toBe("PRINTING");
  });

  test("une annulation est définitive", async () => {
    const f = await ready();
    const id = await request(f);
    await action(f.eventId, id, "cancel");

    expect((await action(f.eventId, id, "retry")).result).toBe("refused");
    expect(
      (
        await db.service<{ result: string }>(
          "transition_print_job",
          id,
          "DONE",
          "agent",
          0
        )
      ).result
    ).toBe("refused");
  });

  test("rejouer une demande annulée le dit à l'invité", async () => {
    const f = await ready();
    const key = randomUUID();
    const { job_id } = await db.createPrintJob(f.userId, f.photoId, key);
    await action(f.eventId, job_id as string, "cancel");

    const replay = await db.createPrintJob(f.userId, f.photoId, key);

    expect(replay.result).toBe("request_cancelled");
  });
});

test.describe("traçabilité et isolation", () => {
  test("chaque action appliquée est tracée, sans les refus", async () => {
    const f = await ready();
    const a = await request(f);
    const b = await request(f);
    await start(f.eventId, a);
    await start(f.eventId, b);
    await action(f.eventId, b, "cancel");

    expect(await actions(f.eventId)).toEqual([
      { action: "start", target_id: a },
      { action: "cancel", target_id: b },
    ]);
  });

  test("le lien d'un événement n'agit pas sur un autre", async () => {
    const mine = await ready();
    const other = await ready();
    const id = await request(other);

    expect((await start(mine.eventId, id)).result).toBe("not_found");
    expect((await action(mine.eventId, id, "cancel")).result).toBe("not_found");
    expect((await job(id)).status).toBe("PENDING");
  });

  for (const [fn, args] of [
    ["start_print_job", "$1::uuid, $2::uuid"],
    ["operator_job_action", "$1::uuid, $2::uuid, 'cancel'"],
  ]) {
    test(`un invité ne peut pas appeler ${fn}`, async () => {
      const f = await db.seed();

      await expect(
        db.as("authenticated", f.userId, (client) =>
          client.query(`select public.${fn}(${args})`, [
            f.eventId,
            randomUUID(),
          ])
        )
      ).rejects.toThrow(/permission denied/);
    });
  }

  test("un invité ne peut pas mettre en pause", async () => {
    const f = await db.seed();

    await expect(
      db.as("authenticated", f.userId, (client) =>
        client.query("select public.set_printing_paused($1, true)", [f.eventId])
      )
    ).rejects.toThrow(/permission denied/);
  });

  test("un invité ne lit ni les liens ni le journal", async () => {
    const f = await db.seed();

    for (const table of ["event_operator_tokens", "operator_actions"]) {
      await expect(
        db.as("authenticated", f.userId, (client) =>
          client.query(`select * from public.${table}`)
        )
      ).rejects.toThrow(/permission denied/);
    }
  });
});

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

const beat = (
  eventId: string,
  agent = "agent-test",
  jobId: string | null = null,
  attempt: number | null = null
) => db.service("record_agent_heartbeat", eventId, agent, jobId, attempt);

const seenAgo = (eventId: string, seconds: number, agent = "agent-test") =>
  db.admin.query(
    `update public.agent_heartbeats
     set last_seen_at = now() - make_interval(secs => $3)
     where event_id = $1 and agent_id = $2`,
    [eventId, agent, seconds]
  );

async function statusFor(f: Fixture) {
  return db.as("authenticated", f.userId, async (client) => {
    const { rows } = await client.query(
      "select public.get_printer_status($1) as online",
      [f.eventId]
    );
    return rows[0].online as boolean;
  });
}

async function printingJob() {
  const f = await db.seed({ limit: 5 });
  const { job_id } = await db.createPrintJob(f.userId, f.photoId, randomUUID());
  await db.admin.query(
    "update public.print_jobs set authorized_at = now() where id = $1",
    [job_id]
  );
  await db.service("claim_print_job", f.eventId, "agent-test");
  return { f, jobId: job_id as string };
}

const jobStatus = async (id: string) =>
  (
    await db.admin.query("select * from public.print_jobs where id = $1", [id])
  ).rows[0];

const silenceJob = (id: string) =>
  db.admin.query(
    `update public.print_jobs
     set last_activity_at = now() - interval '61 seconds' where id = $1`,
    [id]
  );

test.describe("statut de l'imprimante", () => {
  /**
   * Scenario: Agent en ligne
   *   Given l'agent envoie son signal de vie
   *   When j'ouvre l'écran d'impression
   *   Then je vois que l'imprimante est connectée
   */
  test("un agent qui envoie son signal est en ligne", async () => {
    const f = await db.seed();
    await beat(f.eventId);

    expect(await statusFor(f)).toBe(true);
  });

  /**
   * Scenario: Agent hors ligne
   *   Given l'agent n'a rien envoyé depuis 60 secondes
   *   When j'ouvre l'écran d'impression
   *   Then je vois un message clair indiquant que l'imprimante n'est pas connectée
   */
  test("après 60 secondes de silence, l'agent est hors ligne", async () => {
    const f = await db.seed();
    await beat(f.eventId);
    await seenAgo(f.eventId, 61);

    expect(await statusFor(f)).toBe(false);
  });

  test("un retard bref ne change pas le statut", async () => {
    const f = await db.seed();
    await beat(f.eventId);
    await seenAgo(f.eventId, 45);

    expect(await statusFor(f)).toBe(true);
  });

  test("sans agent connu, l'imprimante est hors ligne", async () => {
    const f = await db.seed();

    expect(await statusFor(f)).toBe(false);
  });

  /**
   * Scenario: Retour en ligne
   *   Given l'agent était hors ligne
   *   When il envoie de nouveau son signal de vie
   *   Then l'indicateur repasse en ligne sans recharger la page
   */
  test("un nouveau signal remet l'agent en ligne", async () => {
    const f = await db.seed();
    await beat(f.eventId);
    await seenAgo(f.eventId, 120);
    expect(await statusFor(f)).toBe(false);

    await beat(f.eventId);

    expect(await statusFor(f)).toBe(true);
  });

  /** Cas limite : plusieurs agents, un seul statut cohérent. */
  test("un seul agent en ligne suffit, et une seule ligne par agent", async () => {
    const f = await db.seed();
    await beat(f.eventId, "agent-a");
    await beat(f.eventId, "agent-a");
    await beat(f.eventId, "agent-b");
    await seenAgo(f.eventId, 120, "agent-a");

    expect(await statusFor(f)).toBe(true);

    const { rows } = await db.admin.query(
      `select count(*)::int as n from public.agent_heartbeats
       where event_id = $1`,
      [f.eventId]
    );
    expect(rows[0].n).toBe(2);
  });

  /** Cas limite : décalage d'horloge, l'heure du serveur fait foi. */
  test("l'heure enregistrée est celle du serveur", async () => {
    const f = await db.seed();
    await beat(f.eventId);

    const { rows } = await db.admin.query(
      `select abs(extract(epoch from now() - last_seen_at)) as drift
       from public.agent_heartbeats where event_id = $1`,
      [f.eventId]
    );
    expect(Number(rows[0].drift)).toBeLessThan(5);
  });
});

test.describe("job en cours", () => {
  /**
   * Scenario: Job en cours à la coupure
   *   Given un job est en PRINTING
   *   When l'agent passe hors ligne
   *   Then le job passe en STUCK
   */
  test("sans signal de vie, le job passe en STUCK", async () => {
    const { jobId } = await printingJob();
    await silenceJob(jobId);

    await db.service("mark_stuck_jobs");

    expect((await jobStatus(jobId)).status).toBe("STUCK");
  });

  test("le signal de vie maintient le job en cours", async () => {
    const { f, jobId } = await printingJob();
    await silenceJob(jobId);

    await beat(f.eventId, "agent-test", jobId, 1);
    await db.service("mark_stuck_jobs");

    expect((await jobStatus(jobId)).status).toBe("PRINTING");
  });

  test("un signal sans job ne maintient rien", async () => {
    const { f, jobId } = await printingJob();
    await silenceJob(jobId);

    await beat(f.eventId);
    await db.service("mark_stuck_jobs");

    expect((await jobStatus(jobId)).status).toBe("STUCK");
  });

  test("un signal d'une ancienne tentative ne maintient rien", async () => {
    const { f, jobId } = await printingJob();
    await silenceJob(jobId);

    await beat(f.eventId, "agent-test", jobId, 7);
    await db.service("mark_stuck_jobs");

    expect((await jobStatus(jobId)).status).toBe("STUCK");
  });

  test("un signal ne réveille pas un job terminé", async () => {
    const { f, jobId } = await printingJob();
    await db.service("transition_print_job", jobId, "DONE", "agent", 1);
    const before = (await jobStatus(jobId)).last_activity_at;

    await beat(f.eventId, "agent-test", jobId, 1);

    expect((await jobStatus(jobId)).last_activity_at).toEqual(before);
  });
});

test.describe("droits", () => {
  test("un invité ne peut pas se faire passer pour l'agent", async () => {
    const f = await db.seed();

    await expect(
      db.as("authenticated", f.userId, (client) =>
        client.query("select public.record_agent_heartbeat($1, 'faux')", [
          f.eventId,
        ])
      )
    ).rejects.toThrow(/permission denied/);

    await expect(
      db.as("authenticated", f.userId, (client) =>
        client.query(
          `insert into public.agent_heartbeats
             (event_id, agent_id, last_seen_at)
           values ($1, 'faux', now())`,
          [f.eventId]
        )
      )
    ).rejects.toThrow();
  });

  test("un invité ne voit pas le statut d'un autre événement", async () => {
    const mine = await db.seed();
    const other = await db.seed();
    await beat(other.eventId);

    const online = await db.as("authenticated", mine.userId, async (client) => {
      const { rows } = await client.query(
        "select public.get_printer_status($1) as online",
        [other.eventId]
      );
      return rows[0].online;
    });

    expect(online).toBe(false);
  });

  test("sans session, le statut n'est pas accessible", async () => {
    const f = await db.seed();

    await expect(
      db.as("anon", null, (client) =>
        client.query("select public.get_printer_status($1)", [f.eventId])
      )
    ).rejects.toThrow(/permission denied/);
  });
});

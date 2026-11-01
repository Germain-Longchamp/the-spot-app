import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { TestDb } from "./support/test-db";

let db: TestDb;

test.beforeAll(async () => {
  // Starting Postgres alongside the dev server can take over 30 s on a busy machine.
  test.setTimeout(120_000);
  db = await TestDb.start();
});

test.afterAll(async () => {
  await db?.stop();
});

test.describe("demande d'impression", () => {
  /**
   * Scenario: Demande valide
   *   Given j'ai une photo envoyée et il me reste des impressions
   *   When j'appuie sur "Imprimer"
   *   Then un job PENDING est créé pour cette photo
   */
  test("une demande valide crée un job PENDING non autorisé", async () => {
    const f = await db.seed();
    const { result, job_id } = await db.createPrintJob(
      f.userId,
      f.photoId,
      randomUUID()
    );
    expect(result).toBe("created");

    const { rows } = await db.admin.query(
      "select * from public.print_jobs where id = $1",
      [job_id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "PENDING",
      photo_id: f.photoId,
      event_id: f.eventId,
      guest_id: f.guestId,
      authorized_at: null,
    });
  });

  /**
   * Scenario: Quota atteint
   *   Given j'ai utilisé toutes mes impressions
   *   When je tente d'imprimer
   *   Then aucun job n'est créé
   */
  test("quota atteint : aucun job créé", async () => {
    const f = await db.seed({ quota: 1 });
    await db.createPrintJob(f.userId, f.photoId, randomUUID());

    const second = await db.createPrintJob(f.userId, f.photoId, randomUUID());
    expect(second.result).toBe("quota_reached");
    expect(await db.jobCount(f.guestId)).toBe(1);
  });

  test("un job en échec reste compté dans le quota", async () => {
    const f = await db.seed({ quota: 1 });
    await db.createPrintJob(f.userId, f.photoId, randomUUID());
    await db.admin.query(
      "update public.print_jobs set status = 'FAILED' where guest_id = $1",
      [f.guestId]
    );

    const retry = await db.createPrintJob(f.userId, f.photoId, randomUUID());
    expect(retry.result).toBe("quota_reached");
  });

  /**
   * Scenario: Double appui
   *   When j'appuie deux fois rapidement sur "Imprimer"
   *   Then un seul job est créé
   */
  test("double appui simultané : un seul job", async () => {
    const f = await db.seed({ quota: 3 });
    const key = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        db.createPrintJob(f.userId, f.photoId, key)
      )
    );

    expect(new Set(results.map((r) => r.job_id)).size).toBe(1);
    expect(results.every((r) => r.result === "created")).toBe(true);
    expect(await db.jobCount(f.guestId)).toBe(1);
  });

  test("une réponse perdue puis rejouée rend le même job, quota plein", async () => {
    const f = await db.seed({ quota: 1 });
    const key = randomUUID();
    const first = await db.createPrintJob(f.userId, f.photoId, key);
    const replay = await db.createPrintJob(f.userId, f.photoId, key);

    expect(replay).toEqual(first);
    expect(await db.jobCount(f.guestId)).toBe(1);
  });

  test("la même clé sur une autre photo est refusée", async () => {
    const f = await db.seed({ quota: 3 });
    const other = await db.seedPhoto(f.eventId, f.guestId);
    const key = randomUUID();
    await db.createPrintJob(f.userId, f.photoId, key);

    const result = await db.createPrintJob(f.userId, other, key);
    expect(result.result).toBe("invalid_request");
    expect(await db.jobCount(f.guestId)).toBe(1);
  });

  /** Cas limite : demandes simultanées, décompte du quota atomique. */
  test("demandes simultanées : le quota n'est jamais dépassé", async () => {
    const f = await db.seed({ quota: 2 });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        db.createPrintJob(f.userId, f.photoId, randomUUID())
      )
    );

    expect(results.filter((r) => r.result === "created")).toHaveLength(2);
    expect(results.filter((r) => r.result === "quota_reached")).toHaveLength(8);
    expect(await db.jobCount(f.guestId)).toBe(2);
  });

  /**
   * Scenario: Impression suspendue
   *   Given l'opérateur a suspendu les impressions
   *   When je tente d'imprimer
   *   Then aucun job n'est créé
   */
  test("impressions suspendues : aucun job créé", async () => {
    const f = await db.seed({ paused: true });
    const { result } = await db.createPrintJob(
      f.userId,
      f.photoId,
      randomUUID()
    );
    expect(result).toBe("printing_paused");
    expect(await db.jobCount(f.guestId)).toBe(0);
  });

  test("événement fermé : aucun job créé", async () => {
    const f = await db.seed({ status: "closed" });
    const { result } = await db.createPrintJob(
      f.userId,
      f.photoId,
      randomUUID()
    );
    expect(result).toBe("event_closed");
    expect(await db.jobCount(f.guestId)).toBe(0);
  });

  /** Cas limite : photo supprimée entre la validation et la création. */
  test("photo supprimée : aucun job créé", async () => {
    const f = await db.seed();
    await db.admin.query("delete from public.photos where id = $1", [
      f.photoId,
    ]);
    const { result } = await db.createPrintJob(
      f.userId,
      f.photoId,
      randomUUID()
    );
    expect(result).toBe("photo_not_found");
  });
});

test.describe("isolation et droits (RLS)", () => {
  test("toutes les tables ont RLS activé", async () => {
    const { rows } = await db.admin.query(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace
         and relkind = 'r' and not relrowsecurity`
    );
    expect(rows).toEqual([]);
  });

  test("impossible d'imprimer la photo d'un autre invité", async () => {
    const f = await db.seed();
    const other = await db.seedGuest(f.eventId);

    const { result } = await db.createPrintJob(
      other.userId,
      f.photoId,
      randomUUID()
    );
    expect(result).toBe("photo_not_found");
    expect(await db.jobCount(f.guestId)).toBe(0);
    expect(await db.jobCount(other.guestId)).toBe(0);
  });

  test("un invité ne voit que ses propres jobs", async () => {
    const f = await db.seed();
    const neighbour = await db.seedGuest(f.eventId);
    const mine = await db.createPrintJob(f.userId, f.photoId, randomUUID());
    await db.createPrintJob(neighbour.userId, neighbour.photoId, randomUUID());

    const rows = await db.as("authenticated", f.userId, async (client) => {
      return (await client.query("select id from public.print_jobs")).rows;
    });
    expect(rows.map((r) => r.id)).toEqual([mine.job_id]);
  });

  test("un invité ne voit rien d'un autre événement", async () => {
    const a = await db.seed();
    const b = await db.seed();
    await db.createPrintJob(b.userId, b.photoId, randomUUID());

    const seen = await db.as("authenticated", a.userId, async (client) => {
      const count = async (table: string) =>
        (await client.query(`select id from public.${table}`)).rows.map(
          (r) => r.id
        );
      return {
        events: await count("events"),
        guests: await count("guests"),
        photos: await count("photos"),
        jobs: await count("print_jobs"),
      };
    });

    expect(seen).toEqual({
      events: [a.eventId],
      guests: [a.guestId],
      photos: [a.photoId],
      jobs: [],
    });
  });

  test("un invité ne peut pas fabriquer ni modifier un job directement", async () => {
    const f = await db.seed();
    const { job_id } = await db.createPrintJob(
      f.userId,
      f.photoId,
      randomUUID()
    );

    await expect(
      db.as("authenticated", f.userId, (client) =>
        client.query(
          `insert into public.print_jobs
             (event_id, photo_id, guest_id, idempotency_key)
           values ($1, $2, $3, 'forged')`,
          [f.eventId, f.photoId, f.guestId]
        )
      )
    ).rejects.toThrow();

    const updated = await db.as("authenticated", f.userId, (client) =>
      client.query(
        "update public.print_jobs set authorized_at = now() where id = $1",
        [job_id]
      )
    );
    expect(updated.rowCount).toBe(0);
  });

  test("un invité ne peut pas changer le quota ni lever la pause", async () => {
    const f = await db.seed({ quota: 1, paused: true });

    const updated = await db.as("authenticated", f.userId, (client) =>
      client.query(
        `update public.events
         set print_quota_per_guest = 99, printing_paused = false`
      )
    );
    expect(updated.rowCount).toBe(0);
  });

  test("sans session, aucune demande ni lecture possible", async () => {
    const f = await db.seed();

    await expect(
      db.as("anon", null, (client) =>
        client.query("select public.create_print_job($1, $2)", [
          f.photoId,
          randomUUID(),
        ])
      )
    ).rejects.toThrow(/permission denied/);

    const rows = await db.as("anon", null, async (client) => {
      return (await client.query("select id from public.events")).rows;
    });
    expect(rows).toEqual([]);
  });
});

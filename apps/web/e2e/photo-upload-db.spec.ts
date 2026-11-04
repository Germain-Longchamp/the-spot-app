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

const register = (
  f: Pick<Fixture, "userId" | "eventId">,
  photoId: string,
  published = false
) =>
  db.as("authenticated", f.userId, async (client) => {
    const { rows } = await client.query(
      "select public.register_photo($1, $2, $3) as outcome",
      [photoId, f.eventId, published]
    );
    return rows[0].outcome as { result: string };
  });

const availability = (f: Fixture, eventId = f.eventId) =>
  db.as("authenticated", f.userId, async (client) => {
    const { rows } = await client.query(
      "select public.get_print_availability($1) as state",
      [eventId]
    );
    return rows[0].state as string;
  });

const upload = (userId: string, name: string) =>
  db.as("authenticated", userId, (client) =>
    client.query(
      "insert into storage.objects (bucket_id, name) values ('photos', $1)",
      [name]
    )
  );

test.describe("enregistrer une photo", () => {
  test("la photo est créée dans le dossier de l'invité, non publiée", async () => {
    const f = await db.seed();
    const photoId = randomUUID();

    expect((await register(f, photoId)).result).toBe("created");

    const { rows } = await db.admin.query(
      "select * from public.photos where id = $1",
      [photoId]
    );
    expect(rows[0]).toMatchObject({
      event_id: f.eventId,
      guest_id: f.guestId,
      storage_path: `${f.eventId}/${f.guestId}/${photoId}.jpg`,
      is_published: false,
    });
  });

  /** Scenario: Double validation. */
  test("un envoi répété ne crée qu'une photo", async () => {
    const f = await db.seed();
    const photoId = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 6 }, () => register(f, photoId))
    );

    expect(results.every((r) => r.result === "created")).toBe(true);
    const { rows } = await db.admin.query(
      "select count(*)::int as n from public.photos where id = $1",
      [photoId]
    );
    expect(rows[0].n).toBe(1);
  });

  test("la publication est un choix de l'invité", async () => {
    const f = await db.seed();
    await db.admin.query(
      "update public.events set gallery_visible = true where id = $1",
      [f.eventId]
    );
    const photoId = randomUUID();

    await register(f, photoId, true);

    const { rows } = await db.admin.query(
      "select is_published from public.photos where id = $1",
      [photoId]
    );
    expect(rows[0].is_published).toBe(true);
  });

  test("sans galerie, rien n'est publié même si on le demande", async () => {
    const f = await db.seed();
    await db.admin.query(
      "update public.events set gallery_visible = false where id = $1",
      [f.eventId]
    );
    const photoId = randomUUID();

    expect((await register(f, photoId, true)).result).toBe("created");

    const { rows } = await db.admin.query(
      "select is_published from public.photos where id = $1",
      [photoId]
    );
    expect(rows[0].is_published).toBe(false);
  });

  test("impossible d'enregistrer dans un autre événement", async () => {
    const a = await db.seed();
    const b = await db.seed();

    const outcome = await register(
      { userId: a.userId, eventId: b.eventId },
      randomUUID()
    );

    expect(outcome.result).toBe("refused");
  });

  test("impossible de réutiliser l'identifiant d'une autre photo", async () => {
    const f = await db.seed();
    const other = await db.seedGuest(f.eventId);

    const outcome = await register(
      { userId: other.userId, eventId: f.eventId },
      f.photoId
    );

    expect(outcome.result).toBe("refused");
  });

  test("un événement fermé refuse les photos", async () => {
    const f = await db.seed({ status: "closed" });

    expect((await register(f, randomUUID())).result).toBe("event_closed");
  });

  test("sans session, impossible d'enregistrer", async () => {
    const f = await db.seed();

    await expect(
      db.as("anon", null, (client) =>
        client.query("select public.register_photo($1, $2)", [
          randomUUID(),
          f.eventId,
        ])
      )
    ).rejects.toThrow(/permission denied/);
  });
});

test.describe("stockage", () => {
  test("le bucket est privé", async () => {
    const { rows } = await db.admin.query(
      "select public from storage.buckets where id = 'photos'"
    );

    expect(rows[0].public).toBe(false);
  });

  test("un invité envoie dans son dossier", async () => {
    const f = await db.seed();

    await upload(f.userId, `${f.eventId}/${f.guestId}/${randomUUID()}.jpg`);
  });

  test("impossible d'envoyer dans le dossier d'un autre invité", async () => {
    const f = await db.seed();
    const other = await db.seedGuest(f.eventId);

    await expect(
      upload(f.userId, `${f.eventId}/${other.guestId}/${randomUUID()}.jpg`)
    ).rejects.toThrow(/row-level security/);
  });

  test("impossible d'envoyer dans un autre événement", async () => {
    const a = await db.seed();
    const b = await db.seed();

    await expect(
      upload(a.userId, `${b.eventId}/${a.guestId}/${randomUUID()}.jpg`)
    ).rejects.toThrow(/row-level security/);
  });

  test("un invité ne lit que ses propres fichiers", async () => {
    const f = await db.seed();
    const other = await db.seedGuest(f.eventId);
    const mine = `${f.eventId}/${f.guestId}/${randomUUID()}.jpg`;
    await upload(f.userId, mine);
    await upload(
      other.userId,
      `${f.eventId}/${other.guestId}/${randomUUID()}.jpg`
    );

    const rows = await db.as("authenticated", f.userId, async (client) => {
      return (await client.query("select name from storage.objects")).rows;
    });

    expect(rows.map((r) => r.name)).toEqual([mine]);
  });

  test("sans session, aucun envoi possible", async () => {
    const f = await db.seed();

    await expect(
      db.as("anon", null, (client) =>
        client.query(
          "insert into storage.objects (bucket_id, name) values ('photos', $1)",
          [`${f.eventId}/${f.guestId}/x.jpg`]
        )
      )
    ).rejects.toThrow(/row-level security/);
  });
});

test.describe("disponibilité de l'impression", () => {
  test("impression possible", async () => {
    expect(await availability(await db.seed())).toBe("available");
  });

  test("pause", async () => {
    expect(await availability(await db.seed({ paused: true }))).toBe("paused");
  });

  test("événement fermé", async () => {
    expect(await availability(await db.seed({ status: "closed" }))).toBe(
      "closed"
    );
  });

  test("quota de l'événement atteint par un autre invité", async () => {
    const f = await db.seed({ limit: 1 });
    const other = await db.seedGuest(f.eventId);
    await db.createPrintJob(other.userId, other.photoId, randomUUID());

    expect(await availability(f)).toBe("limit_reached");
  });

  test("une demande annulée libère le quota", async () => {
    const f = await db.seed({ limit: 1 });
    const { job_id } = await db.createPrintJob(
      f.userId,
      f.photoId,
      randomUUID()
    );
    await db.service("operator_job_action", f.eventId, job_id, "cancel");

    expect(await availability(f)).toBe("available");
  });

  test("rien n'est révélé sur un autre événement", async () => {
    const a = await db.seed();
    const b = await db.seed({ paused: true });

    expect(await availability(a, b.eventId)).toBe("unknown");
  });
});

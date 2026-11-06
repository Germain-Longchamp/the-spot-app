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

const tokenOf = async (eventId: string) =>
  (
    await db.admin.query(
      "select access_token from public.events where id = $1",
      [eventId]
    )
  ).rows[0].access_token as string;

async function newUser() {
  const id = randomUUID();
  await db.admin.query("insert into auth.users (id) values ($1)", [id]);
  return id;
}

const join = (userId: string, token: string) =>
  db.as("authenticated", userId, async (client) => {
    const { rows } = await client.query(
      "select public.join_event($1) as outcome",
      [token]
    );
    return rows[0].outcome;
  });

const entry = (token: string) =>
  db.as("anon", null, async (client) => {
    const { rows } = await client.query(
      "select public.get_event_entry($1) as state",
      [token]
    );
    return rows[0].state;
  });

test("un invité rejoint l'événement de son token", async () => {
  const f = await db.seed();
  const user = await newUser();

  const outcome = await join(user, await tokenOf(f.eventId));

  expect(outcome).toMatchObject({
    result: "joined",
    event: {
      id: f.eventId,
      name: "Salon test",
      gallery_enabled: true,
      gallery_visible: false,
    },
  });
  expect(outcome.guest_id).toBeTruthy();
});

/** Cas limite : double scan, une seule session créée. */
test("rejoindre deux fois donne le même invité", async () => {
  const f = await db.seed();
  const user = await newUser();
  const token = await tokenOf(f.eventId);

  const results = await Promise.all(
    Array.from({ length: 5 }, () => join(user, token))
  );

  expect(new Set(results.map((r) => r.guest_id)).size).toBe(1);
});

/** Scenario: Token invalide. */
test("un token inconnu ne donne rien", async () => {
  const user = await newUser();

  expect(await entry("inconnu")).toBe("invalid");
  expect(await join(user, "inconnu")).toEqual({ result: "invalid" });

  const { rows } = await db.admin.query(
    "select count(*)::int as n from public.guests where auth_user_id = $1",
    [user]
  );
  expect(rows[0].n).toBe(0);
});

/** Scenario: Événement fermé. */
test("un événement fermé ne laisse plus entrer", async () => {
  const f = await db.seed({ status: "closed" });
  const user = await newUser();
  const token = await tokenOf(f.eventId);

  expect(await entry(token)).toBe("closed");
  expect(await join(user, token)).toEqual({ result: "closed" });
});

test("la vérification du lien ne révèle aucune donnée", async () => {
  const f = await db.seed();

  expect(await entry(await tokenOf(f.eventId))).toBe("open");
});

/**
 * Scenario: Isolation entre événements
 *   Given je suis invité de l'événement A
 *   When je tente de lire des données de l'événement B
 *   Then l'accès est refusé
 */
test("un invité entré par QR ne voit que son événement", async () => {
  const a = await db.seed();
  const b = await db.seed();
  const user = await newUser();
  await join(user, await tokenOf(a.eventId));

  const events = await db.as("authenticated", user, async (client) => {
    return (await client.query("select id from public.events")).rows;
  });

  expect(events.map((e) => e.id)).toEqual([a.eventId]);
  expect(events.map((e) => e.id)).not.toContain(b.eventId);
});

test("sans session, impossible de rejoindre un événement", async () => {
  const f = await db.seed();
  const token = await tokenOf(f.eventId);

  await expect(
    db.as("anon", null, (client) =>
      client.query("select public.join_event($1)", [token])
    )
  ).rejects.toThrow(/permission denied/);
});

test("un invité ne peut pas s'inscrire lui-même à un autre événement", async () => {
  const a = await db.seed();
  const b = await db.seed();

  await expect(
    db.as("authenticated", a.userId, (client) =>
      client.query(
        "insert into public.guests (event_id, auth_user_id) values ($1, $2)",
        [b.eventId, a.userId]
      )
    )
  ).rejects.toThrow();
});

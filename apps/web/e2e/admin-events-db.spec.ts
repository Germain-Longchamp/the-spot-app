import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { TestDb } from "./support/test-db";

let db: TestDb;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  db = await TestDb.start();
});

test.afterAll(async () => {
  await db?.stop();
});

async function adminUser() {
  const id = randomUUID();
  await db.admin.query("insert into auth.users (id) values ($1)", [id]);
  return id;
}

const token = () => randomUUID() + randomUUID();
const code = () => randomUUID().slice(0, 6).toUpperCase();

function create(admin: string, key: string, name = "Mariage Dupont", shortCode = code()) {
  return db.service<{ result: string; event_id?: string }>(
    "admin_create_event",
    admin,
    key,
    name,
    "2027-06-12",
    token(),
    shortCode,
    `hash-${randomUUID()}`
  );
}

const count = async (sql: string, args: unknown[]) =>
  (await db.admin.query(sql, args)).rows[0].n as number;

/**
 * Scenario: Créer un événement
 *   Then l'événement apparaît, ouvert, avec son lien opérateur (hash seul)
 */
test("crée l'événement ouvert, son lien opérateur et une trace", async () => {
  const admin = await adminUser();

  const answer = await create(admin, randomUUID());

  expect(answer.result).toBe("created");
  const event = (
    await db.admin.query(
      "select name, status, event_date::text as event_date from public.events where id = $1",
      [answer.event_id]
    )
  ).rows[0];
  expect(event).toEqual({ name: "Mariage Dupont", status: "open", event_date: "2027-06-12" });
  expect(
    await count("select count(*)::int n from public.event_operator_tokens where event_id = $1", [
      answer.event_id,
    ])
  ).toBe(1);
  const actions = await db.admin.query(
    "select action, admin_user_id from public.admin_actions where event_id = $1",
    [answer.event_id]
  );
  expect(actions.rows).toEqual([{ action: "create_event", admin_user_id: admin }]);
});

/**
 * Scenario: Double appui
 *   When la même demande de création arrive deux fois
 *   Then un seul événement est créé
 */
test("même clé de création : un seul événement, le même revient", async () => {
  const admin = await adminUser();
  const key = randomUUID();

  const [a, b] = await Promise.all([create(admin, key), create(admin, key)]);
  const again = await create(admin, key);

  expect(new Set([a.event_id, b.event_id, again.event_id]).size).toBe(1);
  expect([a.result, b.result].sort()).toEqual(["created", "existing"]);
  expect(again.result).toBe("existing");
  expect(
    await count("select count(*)::int n from public.events where creation_key = $1", [key])
  ).toBe(1);
  expect(
    await count("select count(*)::int n from public.admin_actions where event_id = $1", [
      a.event_id,
    ])
  ).toBe(1);
});

/**
 * Scenario: Nom manquant
 *   Then aucun événement n'est créé
 */
test("nom vide ou trop long : refusé, rien n'est créé", async () => {
  const admin = await adminUser();
  const before = await count("select count(*)::int n from public.events", []);

  expect((await create(admin, randomUUID(), "   ")).result).toBe("invalid");
  expect((await create(admin, randomUUID(), "x".repeat(121))).result).toBe("invalid");

  expect(await count("select count(*)::int n from public.events", [])).toBe(before);
});

test("code de secours déjà pris : « collision », pour retirer de nouveaux codes", async () => {
  const admin = await adminUser();
  const taken = code();
  await create(admin, randomUUID(), "Premier", taken);

  const answer = await create(admin, randomUUID(), "Second", taken);

  expect(answer.result).toBe("collision");
});

/**
 * Scenario: Nouveau lien opérateur
 *   Then l'ancien lien ne donne plus accès
 */
test("nouveau lien opérateur : l'ancien hash est remplacé, l'action est tracée", async () => {
  const admin = await adminUser();
  const { event_id } = await create(admin, randomUUID());

  const answer = await db.service("admin_reset_operator_link", admin, event_id, "nouveau-hash");

  expect(answer).toEqual({ result: "applied" });
  const hashes = await db.admin.query(
    "select token_hash from public.event_operator_tokens where event_id = $1",
    [event_id]
  );
  expect(hashes.rows).toEqual([{ token_hash: "nouveau-hash" }]);
  expect(
    await count(
      "select count(*)::int n from public.admin_actions where event_id = $1 and action = 'reset_operator_link'",
      [event_id]
    )
  ).toBe(1);
  expect(
    await db.service("admin_reset_operator_link", admin, randomUUID(), "x")
  ).toEqual({ result: "not_found" });
});

/**
 * Scenario: Accès refusé
 *   When un invité appelle une action
 *   Then l'accès est refusé
 */
for (const role of ["anon", "authenticated"] as const) {
  test(`${role} : ni création, ni nouveau lien, ni lecture du journal`, async () => {
    const user = await adminUser();
    const call = (sql: string, args: unknown[]) =>
      db.as(role, role === "anon" ? null : user, (client) => client.query(sql, args));

    await expect(
      call("select public.admin_create_event($1, $2, 'X', null, $3, 'ZZZZZZ', 'h')", [
        user,
        randomUUID(),
        token(),
      ])
    ).rejects.toThrow(/permission denied/);
    await expect(
      call("select public.admin_reset_operator_link($1, $2, 'h')", [user, randomUUID()])
    ).rejects.toThrow(/permission denied/);
    await expect(call("select * from public.admin_actions", [])).rejects.toThrow(
      /permission denied/
    );
  });
}

import { test, expect } from "@playwright/test";
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

const log = (role: "anon" | "authenticated", userId: string | null, message: string, eventId: string | null = null) =>
  db.as(role, userId, (client) =>
    client.query("select public.log_app_error($1, $2, $3, $4)", [
      eventId,
      "/e/[lien]",
      "Mozilla/5.0 (iPhone)",
      message,
    ])
  );

const rows = async (message: string) =>
  (await db.admin.query("select * from public.app_errors where message like $1", [`${message}%`])).rows;

/**
 * Scenario: Erreur côté application
 *   Then elle est enregistrée avec l'écran et le navigateur concernés
 */
test("une erreur d'invité est enregistrée avec l'écran, le navigateur et l'heure du serveur", async () => {
  const f = await db.seed();
  const before = Date.now();

  await log("authenticated", f.userId, "web-1 boom", f.eventId);

  const [row] = await rows("web-1");
  expect(row).toMatchObject({
    source: "web",
    event_id: f.eventId,
    screen: "/e/[lien]",
    browser: "Mozilla/5.0 (iPhone)",
    reporter: f.userId,
  });
  expect(new Date(row.created_at).getTime()).toBeGreaterThanOrEqual(before - 5_000);
});

test("même sans session, une erreur peut être signalée", async () => {
  await log("anon", null, "web-anon entrée impossible");

  expect(await rows("web-anon")).toHaveLength(1);
});

test("textes trop longs coupés", async () => {
  const f = await db.seed();
  await log("authenticated", f.userId, "web-long " + "x".repeat(2000));

  const [row] = await rows("web-long");
  expect(row.message.length).toBe(500);
});

test("une boucle d'erreurs est limitée à 20 par minute et par téléphone", async () => {
  const f = await db.seed();
  for (let i = 0; i < 25; i++) {
    await log("authenticated", f.userId, `web-loop ${i}`);
  }

  expect(await rows("web-loop")).toHaveLength(20);
});

/**
 * Scenario: Données personnelles
 *   When je consulte les journaux
 *   Then ils ne contiennent aucune photo ni information personnelle
 */
test("personne ne peut lire les erreurs, hormis le serveur", async () => {
  const f = await db.seed();
  await log("authenticated", f.userId, "web-secret");

  for (const [role, user] of [["authenticated", f.userId], ["anon", null]] as const) {
    await expect(
      db.as(role, user, (client) => client.query("select * from public.app_errors"))
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as(role, user, (client) =>
        client.query("insert into public.app_errors (source, message) values ('agent', 'faux')")
      )
    ).rejects.toThrow(/permission denied/);
  }
  const read = await db.as("service_role", null, async (client) =>
    (await client.query("select message from public.app_errors where message = 'web-secret'")).rows
  );
  expect(read).toHaveLength(1);
});

/**
 * Scenario: Erreur côté agent
 *   Then elle est journalisée avec le job et le motif
 */
test("l'agent écrit ses erreurs avec l'événement et le job", async () => {
  const f = await db.seed();
  const jobId = "00000000-0000-4000-8000-0000000000aa";

  await db.as("service_role", null, (client) =>
    client.query(
      "insert into public.app_errors (source, event_id, job_id, screen, message) values ('agent', $1, $2, 'salon-1', $3)",
      [f.eventId, jobId, "agent-1 impression en échec : Papier épuisé"]
    )
  );

  const [row] = await rows("agent-1");
  expect(row).toMatchObject({ source: "agent", event_id: f.eventId, job_id: jobId });
});

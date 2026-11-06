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

async function gallery(f: Fixture, settings: { enabled: boolean; visible: boolean }) {
  await db.admin.query(
    "update public.events set gallery_enabled = $2, gallery_visible = $3 where id = $1",
    [f.eventId, settings.enabled, settings.visible]
  );
}

const register = (f: Pick<Fixture, "userId" | "eventId">, published: boolean) =>
  db.as("authenticated", f.userId, async (client) => {
    const photoId = randomUUID();
    const { rows } = await client.query(
      "select public.register_photo($1, $2, $3) as outcome",
      [photoId, f.eventId, published]
    );
    expect(rows[0].outcome.result).toBe("created");
    return photoId;
  });

const isPublished = async (photoId: string) =>
  (
    await db.admin.query("select is_published from public.photos where id = $1", [
      photoId,
    ])
  ).rows[0].is_published as boolean;

const visibleTo = (userId: string, photoId: string) =>
  db.as("authenticated", userId, async (client) =>
    (await client.query("select id from public.photos where id = $1", [photoId]))
      .rows.length > 0
  );

/**
 * Scenario: Publication choisie
 *   Given j'ai activé "Ajouter à la galerie" sur ma photo
 *   Then ma photo est marquée comme publiée
 */
test("publication choisie : la photo est publiée", async () => {
  const f = await db.seed();
  await gallery(f, { enabled: true, visible: true });

  expect(await isPublished(await register(f, true))).toBe(true);
});

/**
 * Scenario: Publication non choisie
 *   Then ma photo n'est pas publiée
 *   And les autres invités ne peuvent pas la voir
 */
test("publication non choisie : non publiée, invisible pour les autres", async () => {
  const f = await db.seed();
  await gallery(f, { enabled: true, visible: true });
  const other = await db.seedGuest(f.eventId);

  const photoId = await register(f, false);

  expect(await isPublished(photoId)).toBe(false);
  expect(await visibleTo(other.userId, photoId)).toBe(false);
  expect(await visibleTo(f.userId, photoId)).toBe(true);
});

/**
 * Scenario: Galerie cachée
 *   Given la galerie de l'événement est cachée
 *   When je publie ma photo
 *   Then elle est enregistrée comme publiée
 *   And elle reste invisible pour les invités
 */
test("galerie cachée : enregistrée comme publiée, invisible pour les autres", async () => {
  const f = await db.seed();
  await gallery(f, { enabled: true, visible: false });
  const other = await db.seedGuest(f.eventId);

  const photoId = await register(f, true);

  expect(await isPublished(photoId)).toBe(true);
  expect(await visibleTo(other.userId, photoId)).toBe(false);
});

test("événement sans galerie : rien n'est publié, même si on le demande", async () => {
  const f = await db.seed();
  await gallery(f, { enabled: false, visible: false });

  expect(await isPublished(await register(f, true))).toBe(false);
});

/**
 * Scenario: Impression sans publication
 *   When je demande une impression sans activer la galerie
 *   Then la photo est imprimée sans être publiée
 */
test("impression sans publication : la demande passe, la photo reste privée", async () => {
  const f = await db.seed();
  await gallery(f, { enabled: true, visible: true });
  const photoId = await register(f, false);

  const outcome = await db.as("authenticated", f.userId, async (client) => {
    const { rows } = await client.query(
      "select public.create_print_job($1, $2) as outcome",
      [photoId, randomUUID()]
    );
    return rows[0].outcome;
  });

  expect(outcome.result).toBe("created");
  expect(await isPublished(photoId)).toBe(false);
});

test("un invité ne peut pas publier lui-même une photo après coup", async () => {
  const f = await db.seed();
  await gallery(f, { enabled: true, visible: true });
  const photoId = await register(f, false);

  await db.as("authenticated", f.userId, (client) =>
    client.query("update public.photos set is_published = true where id = $1", [
      photoId,
    ])
  );

  expect(await isPublished(photoId)).toBe(false);
});

test("l'entrée dans l'événement indique si la galerie existe", async () => {
  const f = await db.seed();
  await gallery(f, { enabled: true, visible: false });
  const token = (
    await db.admin.query("select access_token from public.events where id = $1", [
      f.eventId,
    ])
  ).rows[0].access_token;

  const outcome = await db.as("authenticated", f.userId, async (client) => {
    const { rows } = await client.query("select public.join_event($1) as o", [token]);
    return rows[0].o;
  });

  expect(outcome.event).toMatchObject({ gallery_enabled: true, gallery_visible: false });
});

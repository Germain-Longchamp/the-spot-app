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

async function gallery(eventId: string, enabled: boolean, visible: boolean) {
  await db.admin.query(
    "update public.events set gallery_enabled = $2, gallery_visible = $3 where id = $1",
    [eventId, enabled, visible]
  );
}

/** A photo of this guest, with its file (and thumbnail) in storage. */
async function photoOf(
  f: Pick<Fixture, "userId" | "eventId">,
  published: boolean
) {
  const photoId = randomUUID();
  await db.as("authenticated", f.userId, (client) =>
    client.query("select public.register_photo($1, $2, $3, $4)", [
      photoId,
      f.eventId,
      published,
      published,
    ])
  );
  const { rows } = await db.admin.query(
    "select storage_path, thumb_path from public.photos where id = $1",
    [photoId]
  );
  for (const path of [rows[0].storage_path, rows[0].thumb_path].filter(Boolean)) {
    await db.admin.query(
      "insert into storage.objects (bucket_id, name) values ('photos', $1)",
      [path]
    );
  }
  return { photoId, file: rows[0].storage_path as string, thumb: rows[0].thumb_path as string | null };
}

const galleryOf = (userId: string, eventId: string) =>
  db.as("authenticated", userId, async (client) =>
    (
      await client.query(
        "select id from public.photos where event_id = $1 and is_published order by created_at desc",
        [eventId]
      )
    ).rows.map((row) => row.id as string)
  );

const filesSeenBy = (userId: string) =>
  db.as("authenticated", userId, async (client) =>
    (await client.query("select name from storage.objects")).rows.map(
      (row) => row.name as string
    )
  );

/**
 * Scenario: Galerie visible
 *   Then je vois les photos publiées, les plus récentes en premier
 */
test("galerie ouverte : les photos publiées des autres, les plus récentes d'abord", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, true);
  const author = await db.seedGuest(f.eventId);
  const older = await photoOf({ userId: author.userId, eventId: f.eventId }, true);
  const newer = await photoOf({ userId: author.userId, eventId: f.eventId }, true);

  expect(await galleryOf(f.userId, f.eventId)).toEqual([newer.photoId, older.photoId]);
});

test("galerie ouverte : fichiers et vignettes des photos publiées lisibles", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, true);
  const author = await db.seedGuest(f.eventId);
  const published = await photoOf({ userId: author.userId, eventId: f.eventId }, true);
  const kept = await photoOf({ userId: author.userId, eventId: f.eventId }, false);

  const files = await filesSeenBy(f.userId);

  expect(published.thumb).not.toBeNull();
  expect(files).toEqual(expect.arrayContaining([published.file, published.thumb]));
  expect(files).not.toContain(kept.file);
});

/**
 * Scenario: Galerie cachée
 *   Then aucune photo n'est chargée
 */
test("galerie cachée : aucune photo ni fichier des autres", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, false);
  const author = await db.seedGuest(f.eventId);
  const published = await photoOf({ userId: author.userId, eventId: f.eventId }, true);

  expect(await galleryOf(f.userId, f.eventId)).toEqual([]);
  expect(await filesSeenBy(f.userId)).not.toContain(published.file);
});

test("événement sans galerie : rien, même si elle est marquée visible", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, true);
  const author = await db.seedGuest(f.eventId);
  await photoOf({ userId: author.userId, eventId: f.eventId }, true);
  await gallery(f.eventId, false, true);

  expect(await galleryOf(f.userId, f.eventId)).toEqual([]);
});

/**
 * Scenario: Photo non publiée
 *   Then cette photo n'apparaît pas
 */
test("une photo non publiée n'apparaît pas", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, true);
  const author = await db.seedGuest(f.eventId);
  const kept = await photoOf({ userId: author.userId, eventId: f.eventId }, false);

  expect(await galleryOf(f.userId, f.eventId)).not.toContain(kept.photoId);
});

/**
 * Scenario: Isolation entre événements
 *   Given je suis invité de l'événement A
 *   When je tente de lire la galerie de l'événement B
 *   Then l'accès est refusé
 */
test("un invité de A ne voit ni les photos ni les fichiers de la galerie de B", async () => {
  const a = await db.seed();
  const b = await db.seed();
  await gallery(a.eventId, true, true);
  await gallery(b.eventId, true, true);
  const inB = await photoOf(b, true);

  expect(await galleryOf(a.userId, b.eventId)).toEqual([]);
  expect(await filesSeenBy(a.userId)).not.toContain(inB.file);
});

test("sans session, la galerie est fermée", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, true);
  await photoOf(f, true);

  const rows = await db.as("anon", null, async (client) =>
    (await client.query("select id from public.photos")).rows
  );
  expect(rows).toEqual([]);
});

test("une photo publiée sans vignette garde son image entière", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, true);
  const photoId = randomUUID();
  await db.as("authenticated", f.userId, (client) =>
    client.query("select public.register_photo($1, $2, true)", [photoId, f.eventId])
  );

  const { rows } = await db.admin.query(
    "select thumb_path, is_published from public.photos where id = $1",
    [photoId]
  );
  expect(rows[0]).toEqual({ thumb_path: null, is_published: true });
});

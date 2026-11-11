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

/** What the gallery screen reads (SCRUM-63): one list, newest first. */
const viewOf = (userId: string, eventId: string) =>
  db.as("authenticated", userId, async (client) =>
    (
      await client.query(
        "select id, is_published, is_mine from public.gallery_photos where event_id = $1 order by created_at desc",
        [eventId]
      )
    ).rows as { id: string; is_published: boolean; is_mine: boolean }[]
  );

/**
 * SCRUM-63 — Scenario: Photo non partagée visible par moi seul
 *   Given j'ai décoché la case puis validé sans imprimer
 *   Then je vois ma photo, et un autre invité ne la voit pas
 */
test("vue galerie ouverte : photos partagées + toutes les miennes, marquées", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, true);
  const other = await db.seedGuest(f.eventId);
  const theirsShared = await photoOf({ userId: other.userId, eventId: f.eventId }, true);
  const theirsKept = await photoOf({ userId: other.userId, eventId: f.eventId }, false);
  const mineShared = await photoOf(f, true);
  const mineKept = await photoOf(f, false);

  const mine = await viewOf(f.userId, f.eventId);
  expect(mine.map((row) => row.id)).toEqual(
    expect.arrayContaining([theirsShared.photoId, mineShared.photoId, mineKept.photoId])
  );
  expect(mine.map((row) => row.id)).not.toContain(theirsKept.photoId);
  expect(mine.find((row) => row.id === theirsShared.photoId)?.is_mine).toBe(false);
  expect(mine.find((row) => row.id === mineShared.photoId)?.is_mine).toBe(true);
  expect(mine.find((row) => row.id === mineKept.photoId)).toMatchObject({
    is_mine: true,
    is_published: false,
  });

  // The other guest sees my shared photo, never the one I kept.
  const theirs = (await viewOf(other.userId, f.eventId)).map((row) => row.id);
  expect(theirs).toContain(mineShared.photoId);
  expect(theirs).not.toContain(mineKept.photoId);
});

test("vue galerie fermée : seulement mes photos", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, false);
  const other = await db.seedGuest(f.eventId);
  await photoOf({ userId: other.userId, eventId: f.eventId }, true);
  const mineShared = await photoOf(f, true);
  const mineKept = await photoOf(f, false);

  const rows = await viewOf(f.userId, f.eventId);
  expect(rows.map((row) => row.id).sort()).toEqual(
    [f.photoId, mineShared.photoId, mineKept.photoId].sort()
  );
  expect(rows.every((row) => row.is_mine)).toBe(true);
});

test("vue galerie : une photo supprimée par l'équipe disparaît, même pour son auteur", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, true);
  const removed = await photoOf(f, true);
  await db.admin.query("update public.photos set deleted_at = now(), is_published = false where id = $1", [
    removed.photoId,
  ]);

  expect((await viewOf(f.userId, f.eventId)).map((row) => row.id)).not.toContain(removed.photoId);
});

test("vue galerie : rien pour un invité d'un autre événement ni pour anon", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, true);
  await photoOf(f, true);
  const stranger = await db.seed();

  expect(await viewOf(stranger.userId, f.eventId)).toEqual([]);
  await expect(
    db.as("anon", null, (client) => client.query("select id from public.gallery_photos"))
  ).rejects.toThrow(/permission denied/);
});

/**
 * SCRUM-54 — Scenario: Identité des autres jamais exposée
 *   When je charge la galerie
 *   Then la réponse ne contient aucun identifiant d'invité
 */
test("la vue de galerie n'a aucune colonne d'identité d'invité", async () => {
  const { rows } = await db.admin.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'gallery_photos' order by ordinal_position`
  );
  const columns = rows.map((row) => row.column_name as string);
  expect(columns).toEqual([
    "id",
    "event_id",
    "storage_path",
    "thumb_path",
    "is_published",
    "created_at",
    "is_mine",
  ]);
  expect(columns.some((name) => name.includes("guest") || name.includes("user"))).toBe(false);
});

/**
 * SCRUM-56 — Scenario: Aucune fuite galerie fermée
 *   Given la galerie est fermée
 *   When j'interroge la base avec ma session
 *   Then je n'obtiens aucune photo des autres invités
 */
test("galerie fermée : ni la vue, ni la table, ni les fichiers des autres", async () => {
  const f = await db.seed();
  await gallery(f.eventId, true, false);
  const other = await db.seedGuest(f.eventId);
  const theirs = [
    await photoOf({ userId: other.userId, eventId: f.eventId }, true),
    await photoOf({ userId: other.userId, eventId: f.eventId }, true),
    await photoOf({ userId: other.userId, eventId: f.eventId }, true),
  ];
  await photoOf(f, true);

  const ids: string[] = theirs.map((photo) => photo.photoId);
  const view = await viewOf(f.userId, f.eventId);
  expect(view.some((row) => ids.includes(row.id))).toBe(false);
  expect((await galleryOf(f.userId, f.eventId)).some((id) => ids.includes(id))).toBe(false);
  const files = await filesSeenBy(f.userId);
  expect(files.some((name) => theirs.some((photo) => name === photo.file))).toBe(false);
});

test("réglages de galerie : lisibles pour mon événement seulement", async () => {
  const f = await db.seed();
  const elsewhere = await db.seed();
  const read = (eventId: string) =>
    db.as("authenticated", f.userId, async (client) =>
      (
        await client.query(
          "select gallery_enabled, gallery_visible from public.events where id = $1",
          [eventId]
        )
      ).rows
    );

  expect(await read(f.eventId)).toHaveLength(1);
  expect(await read(elsewhere.eventId)).toEqual([]);
});

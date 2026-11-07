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

type Outcome = { result: string; paths?: string[] };

const remove = (eventId: string, photoId: string) =>
  db.service<Outcome>("operator_delete_photo", eventId, photoId);

/** An open gallery with one published photo (and thumbnail) by the fixture's guest. */
async function publishedPhoto(f: Fixture) {
  await db.admin.query(
    "update public.events set gallery_enabled = true, gallery_visible = true where id = $1",
    [f.eventId]
  );
  const photoId = randomUUID();
  await db.as("authenticated", f.userId, (client) =>
    client.query("select public.register_photo($1, $2, true, true)", [
      photoId,
      f.eventId,
    ])
  );
  return photoId;
}

const photo = async (id: string) =>
  (await db.admin.query("select * from public.photos where id = $1", [id])).rows[0];

const galleryOf = (userId: string, eventId: string) =>
  db.as("authenticated", userId, async (client) =>
    (
      await client.query(
        "select id from public.photos where event_id = $1 and is_published",
        [eventId]
      )
    ).rows.map((row) => row.id as string)
  );

/**
 * Scenario: Suppression par l'administrateur
 *   When je supprime une photo après confirmation
 *   Then elle disparaît de la galerie pour tous les invités
 *   And l'action est tracée
 */
test("suppression : la photo quitte la galerie de tous, l'action est tracée", async () => {
  const f = await db.seed();
  const viewer = await db.seedGuest(f.eventId);
  const photoId = await publishedPhoto(f);
  expect(await galleryOf(viewer.userId, f.eventId)).toContain(photoId);

  const outcome = await remove(f.eventId, photoId);

  expect(outcome.result).toBe("applied");
  expect(outcome.paths).toEqual([
    `${f.eventId}/${f.guestId}/${photoId}.jpg`,
    `${f.eventId}/${f.guestId}/${photoId}-thumb.jpg`,
  ]);
  expect(await galleryOf(viewer.userId, f.eventId)).not.toContain(photoId);
  const row = await photo(photoId);
  expect(row.is_published).toBe(false);
  expect(row.deleted_at).not.toBeNull();

  const { rows } = await db.admin.query(
    "select action, target_id from public.operator_actions where event_id = $1",
    [f.eventId]
  );
  expect(rows).toEqual([{ action: "delete_photo", target_id: photoId }]);
});

/**
 * Scenario: Photo déjà supprimée
 *   Given deux administrateurs agissent en même temps
 *   When le second tente de supprimer la même photo
 *   Then il reçoit un message indiquant qu'elle n'existe plus
 */
test("deux suppressions simultanées : une seule s'applique, l'autre est prévenue", async () => {
  const f = await db.seed();
  const photoId = await publishedPhoto(f);

  const outcomes = await Promise.all([
    remove(f.eventId, photoId),
    remove(f.eventId, photoId),
  ]);

  expect(outcomes.map((o) => o.result).sort()).toEqual(["already_deleted", "applied"]);
  // The second one still gets the files, so a failed file deletion can finish.
  expect(outcomes.every((o) => o.paths?.length === 2)).toBe(true);
  const { rows } = await db.admin.query(
    "select count(*)::int as n from public.operator_actions where target_id = $1",
    [photoId]
  );
  expect(rows[0].n).toBe(1);
});

test("une impression en attente protège la photo", async () => {
  const f = await db.seed();
  const photoId = await publishedPhoto(f);
  await db.createPrintJob(f.userId, photoId, randomUUID());

  expect((await remove(f.eventId, photoId)).result).toBe("print_in_progress");
  expect((await photo(photoId)).deleted_at).toBeNull();
});

test("une impression terminée ou annulée ne bloque pas la suppression", async () => {
  const f = await db.seed();
  const photoId = await publishedPhoto(f);
  const { job_id } = await db.createPrintJob(f.userId, photoId, randomUUID());
  await db.service("operator_job_action", f.eventId, job_id, "cancel");

  expect((await remove(f.eventId, photoId)).result).toBe("applied");
});

test("impossible de supprimer depuis un autre événement", async () => {
  const a = await db.seed();
  const b = await db.seed();
  const photoId = await publishedPhoto(a);

  expect((await remove(b.eventId, photoId)).result).toBe("not_found");
  expect((await photo(photoId)).deleted_at).toBeNull();
});

/**
 * Scenario: Droits insuffisants
 *   Given je suis un invité simple
 *   When je tente de supprimer la photo d'un autre invité
 *   Then l'action est refusée
 */
test("un invité ne peut pas appeler la suppression", async () => {
  const f = await db.seed();
  const other = await db.seedGuest(f.eventId);
  const photoId = await publishedPhoto(f);

  await expect(
    db.as("authenticated", other.userId, (client) =>
      client.query("select public.operator_delete_photo($1, $2)", [f.eventId, photoId])
    )
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.as("anon", null, (client) =>
      client.query("select public.operator_delete_photo($1, $2)", [f.eventId, photoId])
    )
  ).rejects.toThrow(/permission denied/);
});

test("un invité ne peut ni effacer ni masquer la photo d'un autre", async () => {
  const f = await db.seed();
  const other = await db.seedGuest(f.eventId);
  const photoId = await publishedPhoto(f);

  await db.as("authenticated", other.userId, async (client) => {
    await client.query("delete from public.photos where id = $1", [photoId]);
    await client.query(
      "update public.photos set is_published = false, deleted_at = now() where id = $1",
      [photoId]
    );
  });

  const row = await photo(photoId);
  expect(row).toBeDefined();
  expect(row.is_published).toBe(true);
  expect(row.deleted_at).toBeNull();
});

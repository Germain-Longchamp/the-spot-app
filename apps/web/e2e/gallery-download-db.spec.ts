import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { Fixture, TestDb } from "./support/test-db";

// SCRUM-59 — A link to save a photo is signed only for a file the guest may
// read (Storage checks the select policy of storage.objects).

let db: TestDb;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  db = await TestDb.start();
});

test.afterAll(async () => {
  await db?.stop();
});

async function openGallery(eventId: string) {
  await db.admin.query(
    "update public.events set gallery_enabled = true, gallery_visible = true where id = $1",
    [eventId]
  );
}

async function photoOf(f: Pick<Fixture, "userId" | "eventId">, published: boolean) {
  const photoId = randomUUID();
  await db.as("authenticated", f.userId, (client) =>
    client.query("select public.register_photo($1, $2, $3, $4)", [
      photoId,
      f.eventId,
      published,
      published,
    ])
  );
  const { rows } = await db.admin.query("select storage_path from public.photos where id = $1", [
    photoId,
  ]);
  await db.admin.query("insert into storage.objects (bucket_id, name) values ('photos', $1)", [
    rows[0].storage_path,
  ]);
  return rows[0].storage_path as string;
}

const canRead = (userId: string, path: string) =>
  db.as("authenticated", userId, async (client) =>
    (await client.query("select 1 from storage.objects where name = $1", [path])).rowCount === 1
  );

test("galerie ouverte : la photo partagée d'un autre invité peut être enregistrée", async () => {
  const f = await db.seed();
  await openGallery(f.eventId);
  const other = await db.seedGuest(f.eventId);
  const shared = await photoOf({ userId: other.userId, eventId: f.eventId }, true);

  expect(await canRead(f.userId, shared)).toBe(true);
});

/**
 * Scenario: Photo non partagée d'un autre
 *   Given un autre invité a une photo non partagée
 *   When je tente d'obtenir son lien avec ma session
 *   Then l'accès est refusé
 */
test("photo non partagée d'un autre invité : accès refusé", async () => {
  const f = await db.seed();
  await openGallery(f.eventId);
  const other = await db.seedGuest(f.eventId);
  const kept = await photoOf({ userId: other.userId, eventId: f.eventId }, false);

  expect(await canRead(f.userId, kept)).toBe(false);
  // Its author keeps it.
  expect(await canRead(other.userId, kept)).toBe(true);
});

/**
 * Scenario: Autre événement
 *   Given une photo d'un autre événement
 *   When je tente d'obtenir son lien avec ma session
 *   Then l'accès est refusé
 */
test("photo partagée d'un autre événement : accès refusé", async () => {
  const mine = await db.seed();
  const elsewhere = await db.seed();
  await openGallery(mine.eventId);
  await openGallery(elsewhere.eventId);
  const theirs = await photoOf(elsewhere, true);

  expect(await canRead(mine.userId, theirs)).toBe(false);
});

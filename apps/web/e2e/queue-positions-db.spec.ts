import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { TestDb } from "./support/test-db";

// SCRUM-53: the guest's place in the print queue, counted in the database.

let db: TestDb;

test.beforeAll(async () => {
  // Starting Postgres alongside the dev server can take over 30 s on a busy machine.
  test.setTimeout(120_000);
  db = await TestDb.start();
});

test.afterAll(async () => {
  await db?.stop();
});

/** A request of this guest, arrived at the given minute. */
async function job(
  eventId: string,
  guestId: string,
  minute: number,
  status = "PENDING",
  authorized = false
) {
  const photoId = await db.seedPhoto(eventId, guestId);
  const id = randomUUID();
  await db.admin.query(
    `insert into public.print_jobs
       (id, event_id, photo_id, guest_id, status, idempotency_key, authorized_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      eventId,
      photoId,
      guestId,
      status,
      randomUUID(),
      authorized ? new Date() : null,
      new Date(Date.UTC(2026, 10, 11, 14, minute)),
    ]
  );
  return { id, photoId };
}

const setStatus = (jobId: string, status: string) =>
  db.admin.query("update public.print_jobs set status = $2 where id = $1", [jobId, status]);

const positionsOf = (userId: string, eventId: string) =>
  db.as("authenticated", userId, async (client) =>
    (
      await client.query("select * from public.guest_queue_positions($1)", [eventId])
    ).rows as { photo_id: string; ahead: number }[]
  );

/**
 * Scenario: Position d'un tirage en attente
 *   Given 2 demandes de l'événement sont en attente avant la mienne
 *   Then ma carte affiche "2 photos avant la vôtre"
 */
test("deux demandes en attente avant la mienne, validées ou non : 2", async () => {
  const f = await db.seed();
  const other = await db.seedGuest(f.eventId);
  await job(f.eventId, other.guestId, 1, "PENDING", true);
  await job(f.eventId, other.guestId, 2);
  const mine = await job(f.eventId, f.guestId, 3);
  // Arrived after mine: not ahead.
  await job(f.eventId, other.guestId, 4);

  expect(await positionsOf(f.userId, f.eventId)).toEqual([{ photo_id: mine.photoId, ahead: 2 }]);
});

/**
 * Scenario: Prochaine à imprimer
 *   Given aucune demande en attente avant la mienne
 *   Then ma carte affiche "C'est la prochaine"
 */
test("une impression en cours, terminée ou annulée ne compte pas : 0", async () => {
  const f = await db.seed();
  const other = await db.seedGuest(f.eventId);
  for (const [minute, status] of [[1, "PRINTING"], [2, "DONE"], [3, "CANCELLED"], [4, "STUCK"], [5, "FAILED"]] as const) {
    await job(f.eventId, other.guestId, minute, status);
  }
  const mine = await job(f.eventId, f.guestId, 6);

  expect(await positionsOf(f.userId, f.eventId)).toEqual([{ photo_id: mine.photoId, ahead: 0 }]);
});

/**
 * Scenario: La position avance seule
 *   When l'équipe imprime une demande arrivée avant la mienne
 *   Then ma carte affiche "1 photo avant la vôtre"
 */
test("la position avance quand une demande passe à l'impression", async () => {
  const f = await db.seed();
  const other = await db.seedGuest(f.eventId);
  const first = await job(f.eventId, other.guestId, 1);
  await job(f.eventId, other.guestId, 2);
  await job(f.eventId, f.guestId, 3);
  expect((await positionsOf(f.userId, f.eventId))[0].ahead).toBe(2);

  await setStatus(first.id, "PRINTING");

  expect((await positionsOf(f.userId, f.eventId))[0].ahead).toBe(1);
});

test("plusieurs tirages : une position chacun, mes propres demandes comptent", async () => {
  const f = await db.seed();
  const a = await job(f.eventId, f.guestId, 1);
  const b = await job(f.eventId, f.guestId, 2);

  const positions = await positionsOf(f.userId, f.eventId);
  expect(positions).toHaveLength(2);
  expect(positions).toEqual(
    expect.arrayContaining([
      { photo_id: a.photoId, ahead: 0 },
      { photo_id: b.photoId, ahead: 1 },
    ])
  );
});

test("les demandes d'un autre événement ne comptent pas", async () => {
  const f = await db.seed();
  const elsewhere = await db.seed();
  await job(elsewhere.eventId, elsewhere.guestId, 1);
  await job(f.eventId, f.guestId, 2);

  expect((await positionsOf(f.userId, f.eventId))[0].ahead).toBe(0);
});

/**
 * Scenario: Aucune donnée d'un autre invité
 *   Given un autre invité a une demande en attente
 *   When j'interroge la base avec ma session
 *   Then je n'obtiens que des nombres, aucune photo ni demande de cet invité
 */
test("aucune donnée d'un autre invité : seulement mes demandes, en nombres", async () => {
  const f = await db.seed();
  const other = await db.seedGuest(f.eventId);
  const theirs = await job(f.eventId, other.guestId, 1);
  const mine = await job(f.eventId, f.guestId, 2);

  const positions = await positionsOf(f.userId, f.eventId);
  expect(positions).toEqual([{ photo_id: mine.photoId, ahead: 1 }]);
  expect(JSON.stringify(positions)).not.toContain(theirs.photoId);
  expect(JSON.stringify(positions)).not.toContain(other.guestId);

  // Still no direct access to their request.
  const seen = await db.as("authenticated", f.userId, async (client) =>
    (await client.query("select id from public.print_jobs where id = $1", [theirs.id])).rows
  );
  expect(seen).toEqual([]);
});

test("un invité d'un autre événement n'obtient rien", async () => {
  const f = await db.seed();
  await job(f.eventId, f.guestId, 1);
  const stranger = await db.seed();

  expect(await positionsOf(stranger.userId, f.eventId)).toEqual([]);
});

test("sans session, la fonction est refusée", async () => {
  const f = await db.seed();
  await expect(
    db.as("anon", null, (client) =>
      client.query("select * from public.guest_queue_positions($1)", [f.eventId])
    )
  ).rejects.toThrow(/permission denied/);
});

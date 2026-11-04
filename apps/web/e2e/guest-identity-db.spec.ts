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

const register = (userId: string, eventId: string) =>
  db.as("authenticated", userId, async (client) => {
    const photoId = randomUUID();
    await client.query("select public.register_photo($1, $2)", [
      photoId,
      eventId,
    ]);
    return photoId;
  });

const myPhotos = (userId: string, eventId: string) =>
  db.as("authenticated", userId, async (client) => {
    const { rows } = await client.query(
      "select id from public.photos where event_id = $1 order by created_at",
      [eventId]
    );
    return rows.map((row) => row.id as string);
  });

test.describe("retrouver mes photos", () => {
  test("la même identité retrouve ses photos", async () => {
    const f = await db.seed();
    const first = await register(f.userId, f.eventId);
    const second = await register(f.userId, f.eventId);

    // The fixture's guest already owns one photo.
    expect(await myPhotos(f.userId, f.eventId)).toEqual([
      f.photoId,
      first,
      second,
    ]);
  });

  test("une autre identité ne voit pas mes photos", async () => {
    const f = await db.seed();
    const other = await db.seedGuest(f.eventId);
    await register(f.userId, f.eventId);

    expect(await myPhotos(other.userId, f.eventId)).toEqual([other.photoId]);
  });

  test("les demandes d'impression restent liées à l'invité", async () => {
    const f = await db.seed();
    const other = await db.seedGuest(f.eventId);
    await db.as("authenticated", f.userId, (client) =>
      client.query("select public.create_print_job($1, $2)", [
        f.photoId,
        randomUUID(),
      ])
    );

    const seen = (userId: string) =>
      db.as("authenticated", userId, async (client) =>
        (await client.query("select guest_id from public.print_jobs")).rows
      );

    expect(await seen(f.userId)).toEqual([{ guest_id: f.guestId }]);
    expect(await seen(other.userId)).toEqual([]);
  });
});

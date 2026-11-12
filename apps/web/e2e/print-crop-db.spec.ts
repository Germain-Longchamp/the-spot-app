import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { centerCrop } from "../lib/print/layout";
import { Fixture, TestDb } from "./support/test-db";

// SCRUM-65 — The zone kept for the print, checked by the server and handed
// to the agent with the job.

let db: TestDb;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  db = await TestDb.start();
});

test.afterAll(async () => {
  await db?.stop();
});

type Zone = { x: number; y: number; w: number; h: number };

async function register(f: Fixture, size: [number, number] | null, zone: Partial<Zone> | null) {
  const photoId = randomUUID();
  const result = await db.as("authenticated", f.userId, async (client) =>
    (
      await client.query(
        "select public.register_photo($1, $2, false, false, $3::int, $4::int, $5::float8, $6::float8, $7::float8, $8::float8) as r",
        [
          photoId,
          f.eventId,
          size?.[0] ?? null,
          size?.[1] ?? null,
          zone?.x ?? null,
          zone?.y ?? null,
          zone?.w ?? null,
          zone?.h ?? null,
        ]
      )
    ).rows[0].r as { result: string }
  );
  return { photoId, result: result.result };
}

const row = async (photoId: string) =>
  (await db.admin.query("select * from public.photos where id = $1", [photoId])).rows[0];

test("une zone valide est enregistrée avec la taille de la photo", async () => {
  const f = await db.seed();
  const zone = centerCrop(2048, 1536);

  const { photoId, result } = await register(f, [2048, 1536], zone);

  expect(result).toBe("created");
  const photo = await row(photoId);
  expect([photo.width, photo.height]).toEqual([2048, 1536]);
  expect(photo.crop_x).toBeCloseTo(zone.x);
  expect(photo.crop_w).toBeCloseTo(zone.w);
});

test("téléphone d'avant (ancienne version de register_photo) : photo enregistrée sans zone", async () => {
  const f = await db.seed();
  const photoId = randomUUID();
  const result = await db.as("authenticated", f.userId, async (client) =>
    (await client.query("select public.register_photo($1, $2, false, false) as r", [photoId, f.eventId]))
      .rows[0].r as { result: string }
  );

  expect(result.result).toBe("created");
  expect((await row(photoId)).crop_w).toBeNull();
});

test("les deux versions de register_photo ne se confondent jamais", async () => {
  // PostgREST calls with named arguments: 4 names reach the old version only,
  // 10 names the new one only.
  const f = await db.seed();
  const names = (n: number) =>
    ["p_photo_id", "p_event_id", "p_published", "p_with_thumb", "p_width", "p_height",
     "p_crop_x", "p_crop_y", "p_crop_w", "p_crop_h"].slice(0, n);
  const zone = centerCrop(2048, 1536);
  const values: unknown[] = [null, f.eventId, false, false, 2048, 1536, zone.x, zone.y, zone.w, zone.h];
  for (const n of [4, 10]) {
    values[0] = randomUUID();
    const casts = ["uuid", "uuid", "boolean", "boolean", "int", "int", "float8", "float8", "float8", "float8"];
    const args = names(n).map((name, i) => `${name} => $${i + 1}::${casts[i]}`).join(", ");
    const result = await db.as("authenticated", f.userId, async (client) =>
      (await client.query(`select public.register_photo(${args}) as r`, values.slice(0, n))).rows[0].r
    );
    expect(result.result).toBe("created");
    expect((await row(values[0] as string)).crop_w === null).toBe(n === 4);
  }
});

/**
 * Scenario: Zone de recadrage invalide
 *   When une zone hors de l'image est envoyée avec ma session
 *   Then elle est refusée
 */
for (const [name, size, zone] of [
  ["hors de l'image", [2048, 1536], { x: 0.5, y: 0, w: 0.6, h: 1 }],
  ["aux mauvaises proportions", [2048, 1536], { x: 0, y: 0, w: 1, h: 1 }],
  ["négative", [2048, 1536], { x: -0.1, y: 0, w: 0.6, h: 1 }],
  ["incomplète", [2048, 1536], { x: 0.2, y: 0, w: 0.6 }],
  ["sans taille de photo", null, { x: 0.2, y: 0, w: 0.6, h: 1 }],
] as const) {
  test(`zone ${name} : refusée, rien n'est enregistré`, async () => {
    const f = await db.seed();
    const { photoId, result } = await register(
      f,
      size ? [size[0], size[1]] : null,
      zone as Partial<Zone>
    );

    expect(result).toBe("invalid_crop");
    expect(await row(photoId)).toBeUndefined();
  });
}

test("la table refuse aussi une zone hors de la photo écrite directement", async () => {
  const f = await db.seed();
  await expect(
    db.admin.query(
      "update public.photos set width = 100, height = 100, crop_x = 0.5, crop_y = 0, crop_w = 0.8, crop_h = 1 where id = $1",
      [f.photoId]
    )
  ).rejects.toThrow(/photos_crop_check/);
});

test("l'agent reçoit la zone avec le job, ou rien pour une photo d'avant", async () => {
  const f = await db.seed({ limit: 5 });
  const zone = centerCrop(2048, 1536);
  const { photoId } = await register(f, [2048, 1536], zone);

  for (const photo of [photoId, f.photoId]) {
    const { job_id } = await db.createPrintJob(f.userId, photo, randomUUID());
    await db.admin.query("update public.print_jobs set authorized_at = now() where id = $1", [job_id]);
    const claimed = await db.service<Record<string, unknown>>("claim_print_job", f.eventId, "agent-test");
    expect(claimed.result).toBe("claimed");
    expect(claimed.job_id).toBe(job_id);
    if (photo === photoId) {
      expect(claimed.crop).toEqual({ x: zone.x, y: zone.y, w: zone.w, h: zone.h });
    } else {
      expect(claimed.crop).toBeNull();
    }
    await db.service("transition_print_job", job_id, "DONE", "agent", 1, "agent-test", null);
  }
});

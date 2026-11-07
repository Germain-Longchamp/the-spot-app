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

type Outcome = { result: string };

const setting = (fn: string, ...args: unknown[]) => db.service<Outcome>(fn, ...args);

const event = async (id: string) =>
  (await db.admin.query("select * from public.events where id = $1", [id])).rows[0];

const actions = async (eventId: string) =>
  (
    await db.admin.query(
      "select action from public.operator_actions where event_id = $1 order by created_at",
      [eventId]
    )
  ).rows.map((row) => row.action);

async function publish(f: Fixture) {
  const photoId = randomUUID();
  await db.as("authenticated", f.userId, (client) =>
    client.query("select public.register_photo($1, $2, true)", [photoId, f.eventId])
  );
  return photoId;
}

const sees = (userId: string, photoId: string) =>
  db.as("authenticated", userId, async (client) =>
    (await client.query("select 1 from public.photos where id = $1", [photoId])).rows.length > 0
  );

/**
 * Scenario: Libération de la galerie
 *   Given la galerie est cachée
 *   When l'opérateur la rend visible
 *   Then les invités peuvent la consulter immédiatement
 */
test("libérer la galerie : les invités la voient aussitôt, et l'action est tracée", async () => {
  const f = await db.seed();
  const viewer = await db.seedGuest(f.eventId);
  await setting("set_gallery", f.eventId, true, false);
  const photoId = await publish(f);
  expect(await sees(viewer.userId, photoId)).toBe(false);

  expect((await setting("set_gallery", f.eventId, true, true)).result).toBe("applied");

  expect(await sees(viewer.userId, photoId)).toBe(true);
  expect(await actions(f.eventId)).toEqual(["gallery", "gallery"]);
});

test("désactiver la galerie : plus rien n'est visible ni publiable", async () => {
  const f = await db.seed();
  const viewer = await db.seedGuest(f.eventId);
  await setting("set_gallery", f.eventId, true, true);
  const photoId = await publish(f);

  await setting("set_gallery", f.eventId, false, false);

  expect(await sees(viewer.userId, photoId)).toBe(false);
  const later = await publish(f);
  expect((await db.admin.query("select is_published from public.photos where id = $1", [later])).rows[0].is_published).toBe(false);
});

/**
 * Scenario: Changement de quota
 *   When l'opérateur change le nombre maximal d'impressions de l'événement
 *   Then la nouvelle limite s'applique aux prochaines demandes
 */
test("nouvelle limite : appliquée aux prochaines demandes, sans toucher aux anciennes", async () => {
  const f = await db.seed();
  const first = await db.createPrintJob(f.userId, f.photoId, randomUUID());
  expect(first.result).toBe("created");

  expect((await setting("set_print_limit", f.eventId, 1)).result).toBe("applied");

  const second = await db.createPrintJob(f.userId, f.photoId, randomUUID());
  expect(second.result).toBe("print_limit_reached");
  const { rows } = await db.admin.query(
    "select status from public.print_jobs where id = $1",
    [first.job_id]
  );
  expect(rows[0].status).toBe("PENDING");
  expect((await event(f.eventId)).print_limit).toBe(1);
  expect(await actions(f.eventId)).toEqual(["print_limit"]);
});

test("limite vide : plus de limite", async () => {
  const f = await db.seed({ limit: 0 });
  expect((await db.createPrintJob(f.userId, f.photoId, randomUUID())).result).toBe("print_limit_reached");

  await setting("set_print_limit", f.eventId, null);

  expect((await db.createPrintJob(f.userId, f.photoId, randomUUID())).result).toBe("created");
});

test("limite négative refusée", async () => {
  const f = await db.seed();

  expect((await setting("set_print_limit", f.eventId, -1)).result).toBe("invalid");
  expect((await event(f.eventId)).print_limit).toBeNull();
});

/**
 * Scenario: Fermeture de l'événement
 *   When l'opérateur ferme l'événement
 *   Then les invités ne peuvent plus envoyer de photos ni imprimer
 *   And ils voient un message de fin d'événement
 */
test("fermer l'événement : plus de photo, d'impression ni d'entrée ; puis rouvrir", async () => {
  const f = await db.seed();
  const token = (await event(f.eventId)).access_token;

  await setting("set_event_open", f.eventId, false);

  const photo = await db.as("authenticated", f.userId, async (client) =>
    (await client.query("select public.register_photo($1, $2) as o", [randomUUID(), f.eventId])).rows[0].o
  );
  expect(photo.result).toBe("event_closed");
  expect((await db.createPrintJob(f.userId, f.photoId, randomUUID())).result).toBe("event_closed");
  const entry = await db.as("anon", null, async (client) =>
    (await client.query("select public.get_event_entry($1) as s", [token])).rows[0].s
  );
  expect(entry).toBe("closed");

  await setting("set_event_open", f.eventId, true);

  expect((await db.createPrintJob(f.userId, f.photoId, randomUUID())).result).toBe("created");
  expect(await actions(f.eventId)).toEqual(["close", "reopen"]);
});

/**
 * Scenario: Accès refusé
 *   Given je ne suis pas opérateur
 *   When je tente de modifier un réglage
 *   Then l'action est refusée
 */
for (const [fn, args] of [
  ["set_gallery", "$1, true, true"],
  ["set_print_limit", "$1, 5"],
  ["set_event_open", "$1, false"],
] as const) {
  test(`${fn} refusé aux invités et sans session`, async () => {
    const f = await db.seed();
    for (const [role, user] of [["authenticated", f.userId], ["anon", null]] as const) {
      await expect(
        db.as(role, user, (client) =>
          client.query(`select public.${fn}(${args})`, [f.eventId])
        )
      ).rejects.toThrow(/permission denied/);
    }
  });
}

test("un invité ne peut pas modifier l'événement directement", async () => {
  const f = await db.seed();

  await db.as("authenticated", f.userId, (client) =>
    client.query(
      "update public.events set gallery_visible = true, print_limit = 99, status = 'closed' where id = $1",
      [f.eventId]
    )
  );

  const row = await event(f.eventId);
  expect(row.gallery_visible).toBe(false);
  expect(row.print_limit).toBeNull();
  expect(row.status).toBe("open");
});

test("événement inconnu : rien n'est modifié", async () => {
  expect((await setting("set_event_open", randomUUID(), false)).result).toBe("not_found");
});

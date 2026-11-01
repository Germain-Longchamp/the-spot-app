import { test, expect } from "@playwright/test";
import {
  accessUrl,
  generateAccessToken,
  generateShortCode,
  insertEvent,
  qrSvg,
} from "../scripts/event-lib.mjs";
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

const created = (body: object) =>
  new Response(JSON.stringify([body]), { status: 201 });

/**
 * Scenario: Création de l'événement de démo
 *   When j'exécute la création de l'événement "Salon démo"
 *   Then l'événement existe avec un token d'accès unique et un code court
 *   And un QR code pointant vers l'URL d'accès direct est généré
 */
test("création de l'événement avec ses accès", async () => {
  const bodies: { name: string; access_token: string; short_code: string }[] =
    [];
  const fetchFn = async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    return created(body);
  };

  const event = await insertEvent({
    supabaseUrl: "https://x",
    serviceKey: "k",
    name: "Salon démo",
    fetchFn,
  });

  expect(event.name).toBe("Salon démo");
  expect(event.access_token.length).toBeGreaterThanOrEqual(32);
  expect(event.short_code).toMatch(/^[A-Z2-9]{6}$/);
});

test("le QR code pointe vers l'URL d'accès direct", async () => {
  const url = accessUrl("https://the-spot-app.vercel.app/", "jeton");

  expect(url).toBe("https://the-spot-app.vercel.app/e/jeton");
  expect(await qrSvg(url)).toContain("<svg");
});

test("le code court évite les caractères ambigus", () => {
  for (let i = 0; i < 200; i++) {
    expect(generateShortCode()).not.toMatch(/[01OIL]/);
  }
});

test("le token n'est pas devinable", () => {
  const tokens = Array.from({ length: 100 }, () => generateAccessToken());

  expect(new Set(tokens).size).toBe(100);
  expect(tokens[0].length).toBeGreaterThanOrEqual(43);
});

/** Cas limite : collision de code court, régénération automatique. */
test("une collision régénère les codes", async () => {
  let calls = 0;
  const seen: string[] = [];
  const fetchFn = async (_url: string, init: { body: string }) => {
    calls++;
    const body = JSON.parse(init.body);
    seen.push(body.short_code);
    return calls === 1 ? new Response("", { status: 409 }) : created(body);
  };

  const event = await insertEvent({
    supabaseUrl: "https://x",
    serviceKey: "k",
    name: "Salon",
    fetchFn,
  });

  expect(calls).toBe(2);
  expect(event.short_code).toBe(seen[1]);
});

test("une erreur du serveur n'est pas masquée", async () => {
  await expect(
    insertEvent({
      supabaseUrl: "https://x",
      serviceKey: "k",
      name: "Salon",
      fetchFn: async () => new Response("", { status: 401 }),
    })
  ).rejects.toThrow("401");
});

/**
 * Scenario: Unicité des accès
 *   Given deux événements existent
 *   Then leurs tokens et leurs codes courts sont différents
 */
test("la base refuse deux fois le même token ou le même code", async () => {
  const f = await db.seed();
  const { rows } = await db.admin.query(
    "select access_token, short_code from public.events where id = $1",
    [f.eventId]
  );
  const insert = (token: string, code: string) =>
    db.admin.query(
      `insert into public.events (name, access_token, short_code)
       values ('Copie', $1, $2)`,
      [token, code]
    );

  await expect(insert(rows[0].access_token, "AUTRE1")).rejects.toThrow(
    /unique/
  );
  await expect(
    insert(generateAccessToken(), rows[0].short_code)
  ).rejects.toThrow(/unique/);
});

test("un token trop court est refusé", async () => {
  await expect(
    db.admin.query(
      `insert into public.events (name, access_token, short_code)
       values ('Faible', 'court', 'FAIBLE')`
    )
  ).rejects.toThrow(/check/);
});

test("la galerie est cachée par défaut", async () => {
  const f = await db.seed();
  const { rows } = await db.admin.query(
    "select gallery_visible from public.events where id = $1",
    [f.eventId]
  );

  expect(rows[0].gallery_visible).toBe(false);
});

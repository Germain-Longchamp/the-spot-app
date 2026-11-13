import { randomUUID } from "crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setFrameTitle } from "../lib/admin/events";
import { mockGuestBackend, mockPhotoBackend } from "./support/guest-mocks";
import { stripes } from "./support/images";
import { TestDb } from "./support/test-db";

// SCRUM-62 — The organiser sets the text printed on line 1 of the band; by
// default, the event's name. Next prints only: a print keeps its text.

const DEV = "/dev/admin";

test.describe("base de données", () => {
  let db: TestDb;
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    db = await TestDb.start();
  });
  test.afterAll(async () => {
    await db?.stop();
  });

  async function adminUser() {
    const id = randomUUID();
    await db.admin.query("insert into auth.users (id) values ($1)", [id]);
    return id;
  }
  const setTitle = (admin: string, eventId: string, title: string | null) =>
    db.service<{ result: string; frame_title?: string | null }>(
      "admin_set_frame_title",
      admin,
      eventId,
      title
    );
  const titleOf = async (eventId: string) =>
    (await db.admin.query("select frame_title from public.events where id = $1", [eventId])).rows[0]
      .frame_title as string | null;

  async function claim(eventId: string, userId: string, photoId: string) {
    const { job_id } = await db.createPrintJob(userId, photoId, randomUUID());
    await db.admin.query("update public.print_jobs set authorized_at = now() where id = $1", [job_id]);
    return job_id!;
  }

  /**
   * Scenario: Texte personnalisé
   *   When je saisis "Camille & Hugo" comme texte du cadre
   *   Then l'aperçu l'affiche et les invités voient "Camille & Hugo" prérempli
   * Scenario: Trace
   *   When je modifie le texte du cadre
   *   Then une ligne est ajoutée dans admin_actions
   */
  test("enregistré, nettoyé des espaces, et tracé", async () => {
    const f = await db.seed();
    const admin = await adminUser();

    expect(await setTitle(admin, f.eventId, "  Camille & Hugo ")).toEqual({
      result: "applied",
      frame_title: "Camille & Hugo",
    });
    expect(await titleOf(f.eventId)).toBe("Camille & Hugo");
    const trace = await db.admin.query(
      "select action, admin_user_id from public.admin_actions where event_id = $1",
      [f.eventId]
    );
    expect(trace.rows).toEqual([{ action: "set_frame_title", admin_user_id: admin }]);
  });

  /**
   * Cas limite : texte vide → retour au nom de l'événement
   */
  test("texte vide : retour au nom de l'événement", async () => {
    const f = await db.seed();
    const admin = await adminUser();
    await setTitle(admin, f.eventId, "Camille & Hugo");

    expect(await setTitle(admin, f.eventId, "   ")).toEqual({ result: "applied", frame_title: null });
    expect(await titleOf(f.eventId)).toBeNull();
  });

  /**
   * Cas limite : texte trop long → refus
   */
  test("plus de 30 caractères : refusé, rien ne change, pas de trace", async () => {
    const f = await db.seed();
    const admin = await adminUser();

    expect(await setTitle(admin, f.eventId, "x".repeat(31))).toEqual({ result: "invalid" });
    expect(await titleOf(f.eventId)).toBeNull();
    expect(
      (await db.admin.query("select count(*)::int n from public.admin_actions where event_id = $1", [f.eventId]))
        .rows[0].n
    ).toBe(0);
    // 30 is fine; the table refuses more, even written directly.
    expect((await setTitle(admin, f.eventId, "x".repeat(30))).result).toBe("applied");
    await expect(
      db.admin.query("update public.events set frame_title = $2 where id = $1", [f.eventId, "x".repeat(31)])
    ).rejects.toThrow(/events_frame_title_check/);
  });

  test("événement inconnu", async () => {
    expect(await setTitle(await adminUser(), randomUUID(), "X")).toEqual({ result: "not_found" });
  });

  /**
   * Scenario: Réservé aux admins
   *   Given je ne suis pas admin
   *   When j'essaie de modifier le texte du cadre
   *   Then la modification est refusée
   */
  for (const role of ["anon", "authenticated"] as const) {
    test(`${role} : modification refusée`, async () => {
      const f = await db.seed();
      const user = await adminUser();
      await expect(
        db.as(role, role === "anon" ? null : user, (client) =>
          client.query("select public.admin_set_frame_title($1, $2, 'Pirate')", [user, f.eventId])
        )
      ).rejects.toThrow(/permission denied/);
      // Writing the table directly: RLS lets nothing through.
      const direct = await db
        .as(role, role === "anon" ? null : user, (client) =>
          client.query("update public.events set frame_title = 'Pirate' where id = $1", [f.eventId])
        )
        .then((r) => r.rowCount, () => 0);
      expect(direct).toBe(0);
      expect(await titleOf(f.eventId)).toBeNull();
    });
  }

  /**
   * Scenario: Texte par défaut
   *   Given un événement "Mariage Camille et Hugo" sans réglage de cadre
   *   Then la ligne 1 proposée aux invités est "Mariage Camille et Hugo"
   */
  test("les invités reçoivent le texte du cadre, ou le nom par défaut", async () => {
    const f = await db.seed();
    const { rows } = await db.admin.query(
      "update public.events set name = 'Mariage Camille et Hugo' where id = $1 returning access_token",
      [f.eventId]
    );
    const join = async () =>
      (
        await db.as("authenticated", f.userId, (client) =>
          client.query("select public.join_event($1) as r", [rows[0].access_token])
        )
      ).rows[0].r.event.frame_title;

    expect(await join()).toBe("Mariage Camille et Hugo");
    await setTitle(await adminUser(), f.eventId, "Camille & Hugo");
    expect(await join()).toBe("Camille & Hugo");
  });

  /**
   * Règle : un changement vaut pour les prochaines photos ; les tirages déjà
   * demandés ne changent pas.
   */
  test("un tirage garde le texte de sa demande ; les suivants prennent le nouveau", async () => {
    const f = await db.seed({ limit: 5 });
    const admin = await adminUser();
    await setTitle(admin, f.eventId, "Avant");
    const before = await claim(f.eventId, f.userId, f.photoId);

    await setTitle(admin, f.eventId, "Après");
    const first = await db.service<Record<string, unknown>>("claim_print_job", f.eventId, "agent-test");
    expect(first.job_id).toBe(before);
    expect(first.frame).toEqual({ line1: "Avant", line2: null });
    await db.service("transition_print_job", before, "DONE", "agent", 1, "agent-test", null);

    const after = await claim(f.eventId, f.userId, f.photoId);
    const second = await db.service<Record<string, unknown>>("claim_print_job", f.eventId, "agent-test");
    expect(second.job_id).toBe(after);
    expect(second.frame).toEqual({ line1: "Après", line2: null });
  });

  test("tirage demandé avant cette version : le texte du moment", async () => {
    const f = await db.seed({ limit: 5 });
    const job = await claim(f.eventId, f.userId, f.photoId);
    await db.admin.query("update public.print_jobs set frame_line1 = null where id = $1", [job]);
    await setTitle(await adminUser(), f.eventId, "Camille & Hugo");

    const claimed = await db.service<Record<string, unknown>>("claim_print_job", f.eventId, "agent-test");
    expect(claimed.frame).toEqual({ line1: "Camille & Hugo", line2: null });
  });
});

test.describe("côté serveur de l'admin", () => {
  const EVENT = "11111111-1111-4111-8111-111111111111";
  function fakeClient(answer: Record<string, unknown>) {
    const calls: unknown[] = [];
    const client = {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return { data: answer, error: null };
      },
    } as unknown as SupabaseClient;
    return { client, calls };
  }

  test("texte nettoyé comme sur le tirage, puis envoyé", async () => {
    const { client, calls } = fakeClient({ result: "applied", frame_title: "Camille & Hugo" });
    expect(await setFrameTitle(client, "admin", EVENT, " Camille 🎉 & Hugo ")).toEqual({
      kind: "applied",
      frameTitle: "Camille & Hugo",
    });
    expect(calls).toEqual([
      {
        fn: "admin_set_frame_title",
        args: { p_admin_user_id: "admin", p_event_id: EVENT, p_frame_title: "Camille & Hugo" },
      },
    ]);
  });

  /**
   * Cas limite : Texte trop long : refus avec un message clair
   */
  test("trop long : message clair, rien n'est envoyé", async () => {
    const { client, calls } = fakeClient({ result: "applied" });
    expect(await setFrameTitle(client, "admin", EVENT, "x".repeat(31))).toEqual({
      kind: "invalid",
      message: "Le texte est trop long (30 caractères au plus).",
    });
    expect(calls).toHaveLength(0);
  });
});

test.describe("écran de l'admin", () => {
  test("aperçu du tirage en direct, enregistrement, puis retour au nom", async ({ page }) => {
    await page.goto(DEV);
    await page.getByTestId("admin-event").getByRole("button", { expanded: false }).click();
    const form = page.getByRole("form", { name: "Texte du cadre" });
    const input = form.getByRole("textbox");
    const line = form.getByTestId("frame-title-preview").getByTestId("print-line1");

    // Empty: the preview shows the event's name, as the prints will.
    await expect(input).toHaveAttribute("placeholder", "Salon démo");
    const sheet = (await form.getByTestId("print-page").boundingBox())!;
    expect(sheet.width).toBeGreaterThan(150);
    expect(sheet.width / sheet.height).toBeCloseTo(2 / 3, 2);
    await expect(line).toHaveText("Salon démo");

    await input.fill("Camille & Hugo");
    await expect(line).toHaveText("Camille & Hugo");
    await expect(form.getByTestId("frame-title-count")).toHaveText("14/30");
    await form.getByRole("button", { name: "Enregistrer le texte" }).click();
    await expect(form.getByRole("status")).toHaveText(
      "Texte enregistré : il sera sur les prochains tirages."
    );
    await expect(page.getByTestId("frame-title-calls")).toHaveText("Camille & Hugo");

    await input.fill("");
    await expect(line).toHaveText("Salon démo");
    await form.getByRole("button", { name: "Enregistrer le texte" }).click();
    await expect(form.getByRole("status")).toContainText("le nom de l'événement");
  });

  test("le champ s'arrête à 30 caractères", async ({ page }) => {
    await page.goto(DEV);
    await page.getByTestId("admin-event").getByRole("button", { expanded: false }).click();
    const input = page.getByRole("form", { name: "Texte du cadre" }).getByRole("textbox");
    await input.fill("x".repeat(40));
    await expect(input).toHaveValue("x".repeat(30));
  });
});

test.describe("côté invité", () => {
  test("l'aperçu du tirage porte le texte du cadre de l'événement", async ({ page }) => {
    await mockGuestBackend(page, {
      event: { name: "Mariage Camille et Hugo", frame_title: "Camille & Hugo" },
    });
    await mockPhotoBackend(page);
    await page.goto("/e/jeton-de-test");
    await page.getByRole("button", { name: "Importer une photo" }).waitFor();
    await page.getByLabel("Choisir une photo").setInputFiles({
      name: "p.png",
      mimeType: "image/png",
      buffer: await stripes(800, 1000, [[200, 120, 90]]),
    });
    await expect(page.getByTestId("print-line1")).toHaveText("Camille & Hugo");
  });

  test("sans texte réglé (ou ancienne version du serveur) : le nom de l'événement", async ({ page }) => {
    await mockGuestBackend(page, { event: { name: "Salon démo" } });
    await mockPhotoBackend(page);
    await page.goto("/e/jeton-de-test");
    await page.getByRole("button", { name: "Importer une photo" }).waitFor();
    await page.getByLabel("Choisir une photo").setInputFiles({
      name: "p.png",
      mimeType: "image/png",
      buffer: await stripes(800, 1000, [[200, 120, 90]]),
    });
    await expect(page.getByTestId("print-line1")).toHaveText("Salon démo");
  });
});

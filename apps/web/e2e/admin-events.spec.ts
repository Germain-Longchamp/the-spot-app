import { test, expect, Page } from "@playwright/test";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { allowedEmails, isAdmin } from "../lib/admin/allowed";
import { createEvent, resetOperatorLink } from "../lib/admin/events";
import { hashOperatorToken } from "../lib/operator/access";

const DEV = "/dev/admin";
const KEY = "4b1d7f9e-2c3a-4e5f-8a6b-7c8d9e0f1a2b";

const events = (page: Page) => page.getByTestId("admin-event");

async function createFromForm(page: Page, name: string, date = "") {
  await page.getByLabel("Nom de l'événement").fill(name);
  if (date) await page.getByLabel("Date (facultative)").fill(date);
  await page.getByRole("button", { name: "Créer l'événement" }).click();
}

test.describe("écran", () => {
  /**
   * Scenario: Créer un événement
   *   When je saisis "Mariage Dupont", une date, et je valide
   *   Then l'événement apparaît dans la liste, ouvert
   *   And je vois son QR code, son lien d'accès, son code de secours et son
   *   lien opérateur, avec la mention qu'il ne sera plus affiché
   */
  test("créer un événement : il apparaît ouvert, avec QR, lien, code et lien opérateur", async ({
    page,
    baseURL,
  }) => {
    await page.goto(DEV);
    await expect(events(page)).toHaveCount(1);

    await createFromForm(page, "Mariage Dupont", "2027-06-12");

    const created = events(page).filter({ hasText: "Mariage Dupont" });
    await expect(created).toContainText("12 juin 2027");
    await expect(created).toContainText("Ouvert");
    await expect(created.getByRole("img", { name: "QR code d'accès des invités" })).toBeVisible();
    await expect(created.getByTestId("short-code")).toHaveText("MARI23");
    await expect(created.getByTestId("access-url")).toContainText(`${baseURL}/e/`);
    await expect(created.getByTestId("operator-url")).toHaveText(`${baseURL}/operateur/lien-op-1`);
    await expect(created.getByTestId("operator-link")).toContainText("il ne sera plus affiché");
    await expect(page.getByLabel("Nom de l'événement")).toHaveValue("");
  });

  /**
   * Scenario: Nom manquant
   *   Then un message me demande de nommer l'événement et aucun événement n'est créé
   */
  test("nom manquant : message clair, rien n'est envoyé", async ({ page }) => {
    await page.goto(DEV);

    await createFromForm(page, "   ");

    // Next.js adds its own empty route announcer, also an alert.
    await expect(
      page.getByRole("alert").filter({ hasText: "Donnez un nom à l'événement." })
    ).toBeVisible();
    await expect(page.getByTestId("create-calls")).toHaveText("0");
    await expect(events(page)).toHaveCount(1);
  });

  /**
   * Scenario: Double appui
   *   Then un seul événement est créé
   */
  test("double appui : une seule demande, un seul événement", async ({ page }) => {
    await page.goto(DEV);
    await page.getByLabel("Nom de l'événement").fill("Salon bis");

    await page.getByRole("button", { name: "Créer l'événement" }).dblclick();

    await expect(events(page).filter({ hasText: "Salon bis" })).toHaveCount(1);
    await expect(page.getByTestId("create-calls")).toHaveText("1");
  });

  /**
   * Scenario: Nouveau lien opérateur
   *   When je demande un nouveau lien opérateur et je confirme
   *   Then un nouveau lien s'affiche une fois
   */
  test("nouveau lien opérateur : seulement après confirmation", async ({ page, baseURL }) => {
    await page.goto(DEV);
    const salon = events(page).first();
    await salon.getByRole("button", { name: /Salon démo/ }).click();

    await salon.getByRole("button", { name: "Nouveau lien opérateur…" }).click();
    await salon.getByRole("button", { name: "Garder l'ancien" }).click();
    await expect(salon.getByTestId("operator-link")).toHaveCount(0);

    await salon.getByRole("button", { name: "Nouveau lien opérateur…" }).click();
    await expect(salon.getByRole("alertdialog")).toContainText("cessera aussitôt de marcher");
    await salon.getByRole("button", { name: "Créer un nouveau lien" }).click();

    await expect(salon.getByTestId("operator-url")).toHaveText(
      `${baseURL}/operateur/lien-op-nouveau`
    );
  });

  test("petit téléphone : pas de défilement horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(DEV);
    await createFromForm(page, "Mariage avec un nom assez long pour passer à la ligne");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
  });
});

test.describe("accès", () => {
  /**
   * Scenario: Accès refusé
   *   When une personne non connectée ouvre /admin
   *   Then l'accès est refusé
   */
  test("non connecté : formulaire de connexion, aucune donnée d'événement", async ({ page }) => {
    const response = await page.goto("/admin");

    expect(response!.headers()["x-robots-tag"]).toContain("noindex");
    expect(response!.headers()["cache-control"]).toContain("no-store");
    expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByRole("heading", { name: "Espace admin" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByTestId("admin-event")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("/e/");
  });

  test("mauvais mot de passe : message clair, sans dire si l'email existe", async ({ page }) => {
    await page.route("**/auth/v1/token?grant_type=password", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: "invalid_credentials", message: "Invalid login credentials" }),
      })
    );
    await page.goto("/admin");

    await page.getByLabel("Email").fill("quelquun@example.com");
    await page.getByLabel("Mot de passe").fill("pas-le-bon");
    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "Email ou mot de passe incorrect." })
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Invalid login");
  });

  const user = (extra: Partial<User>): User =>
    ({
      id: "u1",
      email: "glongchamp8@gmail.com",
      email_confirmed_at: "2026-11-11T10:00:00Z",
      is_anonymous: false,
      ...extra,
    }) as User;
  const allowed = allowedEmails(" GLongchamp8@gmail.com , alisonmedici@gmail.com,");

  test("la liste ADMIN_EMAILS est lue sans espaces ni majuscules", () => {
    expect(allowed).toEqual(["glongchamp8@gmail.com", "alisonmedici@gmail.com"]);
    expect(allowedEmails("")).toEqual([]);
  });

  test("seul un email confirmé et autorisé ouvre l'espace admin", () => {
    expect(isAdmin(user({}), allowed)).toBe(true);
    expect(isAdmin(user({ email: "GLONGCHAMP8@gmail.com" }), allowed)).toBe(true);
    // A guest's anonymous session, an unconfirmed or unknown email: refused.
    expect(isAdmin(user({ is_anonymous: true }), allowed)).toBe(false);
    expect(isAdmin(user({ email: undefined }), allowed)).toBe(false);
    expect(isAdmin(user({ email_confirmed_at: undefined }), allowed)).toBe(false);
    expect(isAdmin(user({ email: "intrus@example.com" }), allowed)).toBe(false);
    expect(isAdmin(null, allowed)).toBe(false);
    // An empty list lets nobody in.
    expect(isAdmin(user({}), [])).toBe(false);
  });
});

test.describe("serveur", () => {
  function fakeClient(answers: { result: string; event_id?: string }[]) {
    const calls: Record<string, unknown>[] = [];
    const client = {
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        calls.push(args);
        return { data: answers.shift(), error: null };
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: "e1",
                name: "Mariage Dupont",
                event_date: null,
                status: "open",
                access_token: "jeton",
                short_code: "ABCDEF",
                created_at: "2026-11-11T10:00:00Z",
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    return { client, calls };
  }

  test("collision de code : nouveau tirage, transparent", async () => {
    const { client, calls } = fakeClient([
      { result: "collision" },
      { result: "created", event_id: "e1" },
    ]);

    const outcome = await createEvent(client, "admin", { name: "Mariage", date: "", creationKey: KEY });

    expect(outcome.kind).toBe("created");
    expect(calls).toHaveLength(2);
    expect(calls[0].p_short_code).not.toBe(calls[1].p_short_code);
    expect(calls[0].p_creation_key).toBe(calls[1].p_creation_key);
  });

  test("seul le hash du lien opérateur part vers la base", async () => {
    const { client, calls } = fakeClient([{ result: "created", event_id: "e1" }]);

    const outcome = await createEvent(client, "admin", { name: "Mariage", date: "", creationKey: KEY });

    if (outcome.kind !== "created") throw new Error(outcome.kind);
    const token = outcome.operatorPath.replace("/operateur/", "");
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(calls[0].p_operator_token_hash).toBe(hashOperatorToken(token));
    expect(JSON.stringify(calls)).not.toContain(token);
    expect(String(calls[0].p_access_token).length).toBeGreaterThanOrEqual(32);
    expect(calls[0].p_short_code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  test("nom vide ou date invalide : refusé avant la base", async () => {
    const { client, calls } = fakeClient([]);

    expect(await createEvent(client, "a", { name: " ", date: "", creationKey: KEY })).toMatchObject({
      kind: "invalid",
    });
    expect(
      await createEvent(client, "a", { name: "X", date: "2027-13-45", creationKey: KEY })
    ).toMatchObject({ kind: "invalid" });
    expect(calls).toHaveLength(0);
  });

  test("nouveau lien opérateur : hash en base, lien rendu une fois", async () => {
    const { client, calls } = fakeClient([{ result: "applied" }]);

    const outcome = await resetOperatorLink(client, "admin", KEY);

    const token = outcome!.operatorPath.replace("/operateur/", "");
    expect(calls[0]).toMatchObject({ p_event_id: KEY, p_operator_token_hash: hashOperatorToken(token) });
    expect(await resetOperatorLink(fakeClient([]).client, "admin", "pas-un-uuid")).toBeNull();
  });
});

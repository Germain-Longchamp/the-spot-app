import { test, expect } from "@playwright/test";
import { mockGuestBackend } from "./support/guest-mocks";

const URL = "/e/jeton-de-test";

/**
 * Scenario: Entrée directe par QR
 *   When je scanne le QR et j'ouvre l'URL
 *   Then j'arrive sur l'accueil de l'événement sans aucun formulaire
 *   And une session invité anonyme est créée
 */
test("entrée directe, sans formulaire", async ({ page }) => {
  const calls = await mockGuestBackend(page);

  await page.goto(URL);

  await expect(
    page.getByRole("heading", { name: "Salon de démonstration" })
  ).toBeVisible();
  await expect(page.locator("input, textarea")).toHaveCount(0);
  expect(calls.signups).toBeGreaterThanOrEqual(1);
  expect(calls.joins).toBeGreaterThanOrEqual(1);
});

/** Cas limite : double scan, une seule session créée. */
test("un second scan réutilise la même session", async ({ page }) => {
  const calls = await mockGuestBackend(page);
  await page.goto(URL);
  await expect(page.getByRole("heading")).toBeVisible();
  const signups = calls.signups;

  await page.goto(URL);
  await expect(page.getByRole("heading")).toBeVisible();

  expect(calls.signups).toBe(signups);
});

/**
 * Scenario: Token invalide
 *   Then je vois un message neutre et aucune donnée d'événement
 */
test("lien invalide : message neutre et aucune session", async ({ page }) => {
  const calls = await mockGuestBackend(page, { entry: "invalid" });

  await page.goto(URL);

  await expect(page.getByText("Ce lien n'est pas valide")).toBeVisible();
  await expect(page.getByRole("heading")).toHaveCount(0);
  expect(calls.signups).toBe(0);
});

/**
 * Scenario: Événement fermé
 *   Then je vois un message indiquant que l'événement est terminé
 */
test("événement terminé", async ({ page }) => {
  const calls = await mockGuestBackend(page, { entry: "closed" });

  await page.goto(URL);

  await expect(page.getByText("Cet événement est terminé")).toBeVisible();
  expect(calls.signups).toBe(0);
});

/** Cas limite : réseau lent, écran de chargement avec message simple. */
test("un écran de chargement rassure pendant l'ouverture", async ({ page }) => {
  await mockGuestBackend(page);
  await page.route("**/rest/v1/rpc/get_event_entry", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fallback();
  });

  await page.goto(URL);

  await expect(page.getByText("Ouverture de l'événement")).toBeVisible();
});

test("sans réseau, l'invité peut réessayer", async ({ page }) => {
  const backend = { failEntry: true };
  await mockGuestBackend(page, backend);
  await page.goto(URL);
  await expect(page.getByText("Vérifiez votre connexion")).toBeVisible();

  backend.failEntry = false;
  await page.getByRole("button", { name: "Réessayer" }).click();

  await expect(page.getByRole("heading")).toBeVisible();
});

/** Cas limite : cookies bloqués, message clair et pas d'erreur technique. */
test("navigateur bloquant les cookies : message clair", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "cookieEnabled", { value: false });
  });
  await mockGuestBackend(page);

  await page.goto(URL);

  await expect(page.getByText("Quittez la navigation privée")).toBeVisible();
});

test("la page d'entrée n'est pas indexée", async ({ page }) => {
  await mockGuestBackend(page);
  await page.goto(URL);

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/
  );
});

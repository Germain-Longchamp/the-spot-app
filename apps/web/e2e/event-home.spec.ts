import { test, expect } from "@playwright/test";
import { mockGuestBackend } from "./support/guest-mocks";

const URL = "/e/jeton-de-test";

/**
 * Scenario: Accueil nominal
 *   Then je vois le nom de l'événement
 *   And les boutons "Prendre une photo" et "Importer une photo"
 */
test("accueil nominal", async ({ page }) => {
  await mockGuestBackend(page);
  await page.goto(URL);

  await expect(
    page.getByRole("heading", { name: "Salon de démonstration" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prendre une photo" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Importer une photo" })
  ).toBeVisible();
});

test("les deux actions sont visibles sans défiler, à la même taille", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockGuestBackend(page);
  await page.goto(URL);

  const take = page.getByRole("button", { name: "Prendre une photo" });
  const load = page.getByRole("button", { name: "Importer une photo" });
  await expect(take).toBeInViewport({ ratio: 1 });
  await expect(load).toBeInViewport({ ratio: 1 });

  const [a, b] = [await take.boundingBox(), await load.boundingBox()];
  // Same size to the pixel; browsers round sub-pixels differently.
  expect(a!.width).toBeCloseTo(b!.width, 0);
  expect(a!.height).toBeCloseTo(b!.height, 0);
});

/**
 * SCRUM-63 — Scenario: Une seule entrée
 *   The gallery link stays on the home even while the gallery is closed: it is
 *   where the guest finds their own photos.
 */
test("galerie masquée : le lien reste, pour retrouver ses photos", async ({ page }) => {
  await mockGuestBackend(page);
  await page.goto(URL);

  await expect(
    page.getByRole("link", { name: "Galerie de l'événement" })
  ).toBeVisible();
});

test("événement sans galerie : le lien s'appelle « Vos photos »", async ({ page }) => {
  await mockGuestBackend(page, { event: { gallery_enabled: false } });
  await page.goto(URL);

  await expect(page.getByRole("link", { name: "Vos photos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Galerie de l'événement" })).toHaveCount(0);
});

test("galerie visible : le lien apparaît", async ({ page }) => {
  await mockGuestBackend(page, { event: { gallery_visible: true } });
  await page.goto(URL);

  await expect(
    page.getByRole("link", { name: "Galerie de l'événement" })
  ).toBeVisible();
});

/**
 * Scenario: Événement clôturé
 *   Then je vois un message indiquant que l'événement est terminé
 *   And aucune action de photo n'est proposée
 */
test("événement clôturé : aucune action", async ({ page }) => {
  await mockGuestBackend(page, { entry: "closed" });
  await page.goto(URL);

  await expect(page.getByText("Cet événement est terminé")).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
});

/** Cas limite : nom d'événement très long. */
test("un nom très long ne casse pas la page", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockGuestBackend(page, {
    event: { name: "Rendez-vous-professionnel-international-".repeat(4) },
  });
  await page.goto(URL);
  await expect(page.getByRole("heading")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow).toBe(false);
});

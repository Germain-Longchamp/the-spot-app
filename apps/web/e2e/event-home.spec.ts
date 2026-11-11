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

/**
 * SCRUM-57 — Scenario: Hiérarchie des actions
 *   Then "Prendre une photo" est le bouton principal et "Importer une photo" le bouton secondaire
 *   And les deux sont visibles sans défilement sur un téléphone de 320 x 568
 */
test("action principale et secondaire, visibles sans défiler sur 320 x 568", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockGuestBackend(page, { event: { event_date: "2027-01-21" } });
  await page.goto(URL);

  const take = page.getByRole("button", { name: "Prendre une photo" });
  const load = page.getByRole("button", { name: "Importer une photo" });
  await expect(take).toHaveAttribute("data-variant", "primary");
  await expect(load).toHaveAttribute("data-variant", "secondary");
  await expect(take).toContainText("Avec l'appareil de votre téléphone");
  await expect(load).toContainText("Depuis vos photos");
  await expect(take).toBeInViewport({ ratio: 1 });
  await expect(load).toBeInViewport({ ratio: 1 });
});

/**
 * SCRUM-57 — Scenario: Plus de "Comment ça marche" ni de "Mes photos"
 */
test("ni « Comment ça marche » ni « Mes photos »", async ({ page }) => {
  await mockGuestBackend(page);
  await page.goto(URL);
  await expect(page.getByRole("button", { name: "Prendre une photo" })).toBeVisible();

  await expect(page.getByText("Comment ça marche")).toHaveCount(0);
  await expect(page.getByText("Mes photos")).toHaveCount(0);
});

/** SCRUM-57 — la date de l'événement en surtitre. */
test("surtitre : la date de l'événement", async ({ page }) => {
  await mockGuestBackend(page, { event: { event_date: "2027-01-21" } });
  await page.goto(URL);

  await expect(page.getByTestId("event-date")).toHaveText("21 janvier 2027");
});

/**
 * SCRUM-57 — Scenario: Date absente
 *   Given l'événement n'a pas de date
 *   Then aucun surtitre n'est affiché
 */
test("date absente : aucun surtitre", async ({ page }) => {
  await mockGuestBackend(page);
  await page.goto(URL);
  await expect(page.getByRole("heading", { name: "Salon de démonstration" })).toBeVisible();

  await expect(page.getByTestId("event-date")).toHaveCount(0);
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
    page.getByRole("link", { name: /Voir la galerie/ })
  ).toBeVisible();
});

test("événement sans galerie : le lien s'appelle « Vos photos »", async ({ page }) => {
  await mockGuestBackend(page, { event: { gallery_enabled: false } });
  await page.goto(URL);

  await expect(page.getByRole("link", { name: "Vos photos" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Voir la galerie/ })).toHaveCount(0);
});

test("galerie visible : le lien apparaît", async ({ page }) => {
  await mockGuestBackend(page, { event: { gallery_visible: true } });
  await page.goto(URL);

  await expect(
    page.getByRole("link", { name: /Voir la galerie/ })
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

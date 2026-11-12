import { test, expect, Page } from "@playwright/test";
import { json, mockGuestBackend } from "./support/guest-mocks";
import { mockGallery } from "./support/gallery-mocks";
import { GALLERY_POLL_INTERVAL_MS } from "../lib/guest/gallery";

// SCRUM-56 — the surprise gallery: closed, the guest still finds their photos.

const GALLERY = "/e/jeton-de-test/galerie";
const thumbs = (page: Page) => page.getByTestId("gallery-photo");

test.use({ viewport: { width: 390, height: 844 } });

async function openSurprise(page: Page, ids: string[], options: { mine?: string[] } = {}) {
  await mockGuestBackend(page, {
    event: { name: "Salon démo", gallery_enabled: true, gallery_visible: false },
  });
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  await page.route("**/rest/v1/print_jobs?**", (route) => json(route, []));
  const settings = { enabled: true, visible: false };
  await page.route("**/rest/v1/events?**", (route) =>
    json(route, { gallery_enabled: settings.enabled, gallery_visible: settings.visible })
  );
  const gallery = await mockGallery(page, ids, options);
  await page.clock.install({ time: new Date("2026-11-06T14:00:00Z") });
  await page.goto(GALLERY);
  return { gallery, settings };
}

/**
 * Scenario: Galerie fermée
 *   Given la galerie de "Salon démo" est activée mais fermée
 *   When j'ouvre la Galerie depuis l'accueil
 *   Then je vois "La galerie est une surprise" et "La galerie de Salon démo sera dévoilée plus tard"
 */
test("galerie fermée : la surprise, avec le nom de l'événement", async ({ page }) => {
  await openSurprise(page, ["m1"], { mine: ["m1"] });

  await expect(page.getByText("La galerie est une surprise")).toBeVisible();
  await expect(
    page.getByText("La galerie de Salon démo sera dévoilée plus tard. En attendant, vos photos sont bien gardées.")
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Prendre une photo" })).toBeVisible();
});

/**
 * Scenario: Seulement mes photos
 *   Given j'ai 2 photos et un autre invité 3
 *   And la galerie est fermée
 *   When j'ouvre la Galerie
 *   Then je vois "2 photos" et uniquement les miennes
 *   (la base ne renvoie que les miennes : voir gallery-view-db.spec.ts)
 */
test("seulement mes photos : « Vos photos », « 2 photos »", async ({ page }) => {
  await openSurprise(page, ["m2", "m1"], { mine: ["m2", "m1"] });

  await expect(page.getByRole("heading", { name: "Vos photos" })).toBeVisible();
  await expect(page.getByTestId("gallery-total")).toHaveText("2 photos");
  await expect(thumbs(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Ouvrir votre photo" })).toHaveCount(2);
});

/**
 * Scenario: Ouverture par l'équipe
 *   Given je suis sur l'écran surprise
 *   When l'équipe ouvre la galerie
 *   Then la galerie complète s'affiche au rafraîchissement suivant
 */
test("ouverture par l'équipe : la galerie complète au rafraîchissement suivant", async ({ page }) => {
  const { gallery, settings } = await openSurprise(page, ["m1"], { mine: ["m1"] });
  await expect(thumbs(page)).toHaveCount(1);

  // Opened: the database now returns the others' shared photos too.
  settings.visible = true;
  gallery.ids = ["o3", "o2", "o1", "m1"];
  await page.clock.runFor(GALLERY_POLL_INTERVAL_MS);

  await expect(page.getByText("La galerie est une surprise")).toHaveCount(0);
  await expect(thumbs(page)).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Agrandir la photo" })).toHaveCount(3);
});

/** Cas limite : aucune photo. */
test("aucune photo : « Vous n'avez pas encore de photo » et « Prendre une photo »", async ({ page }) => {
  await openSurprise(page, []);

  await expect(page.getByText("Vous n'avez pas encore de photo")).toBeVisible();
  await expect(page.getByRole("link", { name: "Prendre une photo" })).toBeVisible();
});

/** Cas limite : réseau coupé, dernier état affiché. */
test("réseau coupé : l'écran surprise et mes photos restent", async ({ page }) => {
  const { gallery } = await openSurprise(page, ["m1"], { mine: ["m1"] });
  await expect(thumbs(page)).toHaveCount(1);
  await page.route("**/rest/v1/events?**", (route) => route.abort("internetdisconnected"));
  gallery.fail = true;

  await page.clock.runFor(GALLERY_POLL_INTERVAL_MS * 3);

  await expect(page.getByText("La galerie est une surprise")).toBeVisible();
  await expect(thumbs(page)).toHaveCount(1);
});

test("galerie désactivée : pas d'écran surprise, « Vos photos »", async ({ page }) => {
  await mockGuestBackend(page, { event: { gallery_enabled: false, gallery_visible: false } });
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  await page.route("**/rest/v1/print_jobs?**", (route) => json(route, []));
  await mockGallery(page, ["m1"], { mine: ["m1"] });
  await page.goto(GALLERY);

  await expect(page.getByRole("heading", { name: "Vos photos", level: 1 })).toBeVisible();
  await expect(page.getByText("La galerie est une surprise")).toHaveCount(0);
});

import { test, expect, Page } from "@playwright/test";
import { fakeJob, mockAlbum } from "./support/album-mocks";
import { mockGuestBackend, TEST_EVENT } from "./support/guest-mocks";

// SCRUM-57 — Alison's home: the prints banner and the one gallery entry.

const URL = "/e/jeton-de-test";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-06T14:00:00Z") });
});

const banner = (page: Page) => page.getByTestId("print-banner");
const galleryCount = (page: Page) => page.getByTestId("gallery-count");

async function openHome(page: Page, event: Partial<typeof TEST_EVENT> = {}) {
  await mockGuestBackend(page, { event });
  await page.goto(URL);
  await expect(page.getByRole("button", { name: "Prendre une photo" })).toBeVisible();
}

/**
 * Scenario: Tirages en cours
 *   Given j'ai 2 tirages en attente
 *   When j'ouvre l'accueil
 *   Then un bandeau indique "2 tirages dans la file" et ouvre "Vos tirages"
 */
test("deux tirages en attente : « 2 tirages dans la file », puis « Vos tirages »", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }, { id: "b" }],
    jobs: [
      fakeJob("j2", "PENDING", "b", "2026-11-06T13:50:00.000Z"),
      fakeJob("j1", "PENDING", "a", "2026-11-06T13:45:00.000Z"),
    ],
    ahead: { a: 2, b: 5 },
  });
  await openHome(page);

  await expect(banner(page)).toContainText("2 tirages dans la file");
  // The position of the next one: the guest's oldest request.
  await expect(banner(page)).toContainText("2 photos avant la vôtre");
  await banner(page).click();

  await expect(page.getByRole("heading", { name: "Vos tirages" })).toBeVisible();
});

test("un seul tirage, le prochain à imprimer", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 0 } });
  await openHome(page);

  await expect(banner(page)).toContainText("1 tirage dans la file");
  await expect(banner(page)).toContainText("C'est la prochaine");
});

test("une photo prête passe avant la file", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }, { id: "b" }],
    jobs: [fakeJob("j2", "PENDING", "b"), fakeJob("j1", "DONE", "a")],
    ahead: { b: 1 },
  });
  await openHome(page);

  await expect(banner(page)).toContainText("Votre photo est prête");
});

test("un souci passe avant tout", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }, { id: "b" }],
    jobs: [fakeJob("j2", "DONE", "b"), fakeJob("j1", "STUCK", "a")],
  });
  await openHome(page);

  await expect(banner(page)).toContainText("Un souci avec votre impression");
  await expect(banner(page)).toContainText("Rendez-vous auprès de l'équipe");
});

/**
 * Scenario: Aucun tirage
 *   Given je n'ai aucun tirage en cours
 *   Then aucun bandeau n'est affiché
 */
test("aucun tirage : aucun bandeau", async ({ page }) => {
  const album = await mockAlbum(page, { photos: [{ id: "a" }] });
  await openHome(page);
  await expect.poll(() => album.photoQueries.length).toBeGreaterThan(0);

  await expect(banner(page)).toHaveCount(0);
});

/**
 * Scenario: Galerie ouverte
 *   Given la galerie est ouverte et contient 24 photos partagées
 *   Then l'entrée "Galerie" affiche "24 photos partagées"
 */
test("galerie ouverte : « 24 photos partagées »", async ({ page }) => {
  const shared = Array.from({ length: 24 }, (_, i) => ({ id: `p${i}`, is_published: true }));
  const album = await mockAlbum(page, { photos: [...shared, { id: "gardee" }] });
  await openHome(page, { gallery_enabled: true, gallery_visible: true });

  await expect(galleryCount(page)).toHaveText("24 photos partagées");
  expect(album.galleryQueries.some((url) => url.includes("is_published=eq.true"))).toBe(true);
});

test("galerie fermée : dévoilée plus tard, avec le nombre de mes photos", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }, { id: "b", is_published: true }] });
  await openHome(page, { gallery_enabled: true, gallery_visible: false });

  await expect(galleryCount(page)).toHaveText("Dévoilée plus tard · 2 de vos photos");
});

test("sans galerie : « Vos photos » et leur nombre", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }] });
  await openHome(page, { gallery_enabled: false, gallery_visible: false });

  await expect(page.getByRole("link", { name: /Vos photos/ })).toBeVisible();
  await expect(galleryCount(page)).toHaveText("1 de vos photos");
});

test("galerie ouverte et vide : « Aucune photo pour l'instant »", async ({ page }) => {
  await mockAlbum(page);
  await openHome(page, { gallery_enabled: true, gallery_visible: true });

  await expect(galleryCount(page)).toHaveText("Aucune photo pour l'instant");
});

test("compteur illisible : l'entrée reste, sans nombre", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a", is_published: true }] });
  await page.route("**/rest/v1/gallery_photos?**", (route) => route.fulfill({ status: 500 }));
  await openHome(page, { gallery_enabled: true, gallery_visible: true });

  await expect(page.getByRole("link", { name: /Voir la galerie/ })).toBeVisible();
  await expect(galleryCount(page)).toHaveCount(0);
});

test("entrée en bas de l'écran, sous les actions", async ({ page }) => {
  await mockAlbum(page);
  await openHome(page);

  const link = page.getByRole("link", { name: /Voir la galerie/ });
  const [linkBox, importBox] = [
    await link.boundingBox(),
    await page.getByRole("button", { name: "Importer une photo" }).boundingBox(),
  ];
  expect(linkBox!.y).toBeGreaterThan(importBox!.y);
  await expect(link).toBeInViewport({ ratio: 1 });
});

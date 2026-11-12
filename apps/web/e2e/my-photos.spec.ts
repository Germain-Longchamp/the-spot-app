import { test, expect, Page } from "@playwright/test";
import { guestStatusLabel } from "../lib/print/job-status";
import { fakeJob, mockAlbum } from "./support/album-mocks";
import { GUEST_ID, mockGuestBackend, TEST_EVENT } from "./support/guest-mocks";

// The guest's photos and prints since SCRUM-63: no "Mes photos" any more, the
// print banner on the home, and the guest's own photos inside the gallery.

const URL = "/e/jeton-de-test";
const GALLERY = "/e/jeton-de-test/galerie";
const RAW = /PENDING|PRINTING|DONE|STUCK|FAILED|CANCELLED/;
const POLL_MS = 5_000;

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-06T14:00:00Z") });
});

async function openHome(page: Page, event: Partial<typeof TEST_EVENT> = {}) {
  await mockGuestBackend(page, { event });
  await page.goto(URL);
  await expect(page.getByRole("button", { name: "Prendre une photo" })).toBeVisible();
}

const banner = (page: Page) => page.getByTestId("print-banner");
const myTiles = (page: Page) => page.getByRole("button", { name: "Ouvrir votre photo" });

const viewer = (page: Page) => page.getByRole("dialog", { name: "Photo agrandie" });
const printState = (page: Page) => page.getByTestId("viewer-print-state");

/** Opens the gallery, then the guest's first photo large (SCRUM-55). */
async function openMyPhoto(page: Page, event: Partial<typeof TEST_EVENT> = {}) {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true, ...event } });
  await page.goto(GALLERY);
  await expect(myTiles(page).first()).toBeVisible();
  await myTiles(page).first().click();
  await expect(viewer(page).getByRole("img", { name: "Votre photo" })).toBeVisible();
}

/**
 * SCRUM-63 — Scenario: Une seule entrée
 *   When j'ouvre l'accueil
 *   Then je vois l'entrée "Galerie" et aucune carte "Mes photos"
 */
test("une seule entrée : la galerie, plus de « Mes photos »", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }, { id: "b" }] });
  await openHome(page);

  await expect(page.getByRole("link", { name: /Voir la galerie/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Mes photos/ })).toHaveCount(0);
  await expect(page.getByText("Mes photos")).toHaveCount(0);
});

test("même galerie fermée, l'entrée reste là pour retrouver ses photos", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }] });
  await openHome(page, { gallery_enabled: true, gallery_visible: false });

  await page.getByRole("link", { name: /Voir la galerie/ }).click();

  await expect(page.getByText("La galerie est une surprise")).toBeVisible();
  await expect(myTiles(page)).toHaveCount(1);
});

test("événement sans galerie : l'entrée s'appelle « Vos photos »", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }] });
  await openHome(page, { gallery_enabled: false, gallery_visible: false });

  await page.getByRole("link", { name: "Vos photos" }).click();

  await expect(page.getByRole("heading", { name: "Vos photos" })).toBeVisible();
  await expect(myTiles(page)).toHaveCount(1);
  await expect(page.getByText("La galerie est une surprise")).toHaveCount(0);
});

/**
 * SCRUM-63 — Scenario: Photo non partagée visible par moi seul
 *   Given j'ai décoché la case puis validé sans imprimer
 *   When j'ouvre la Galerie
 *   Then je vois ma photo avec la mention "Non partagée"
 */
test("mes photos sont marquées « Vous », les non partagées « Non partagée »", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "partagee", is_published: true }, { id: "gardee" }] });
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  await page.goto(GALLERY);

  await expect(myTiles(page)).toHaveCount(2);
  const tiles = page.locator("li").filter({ has: myTiles(page) });
  await expect(tiles.nth(0)).toContainText("Vous");
  await expect(tiles.nth(0)).not.toContainText("Non partagée");
  await expect(tiles.nth(1)).toContainText("Vous");
  await expect(tiles.nth(1)).toContainText("Non partagée");
});

/**
 * SCRUM-63 — Scenario: Imprimer plus tard une de mes photos
 *   Given une de mes photos n'a jamais été imprimée
 *   When je l'ouvre en grand
 *   Then le bouton "Imprimer" est proposé
 */
test("imprimer plus tard une de mes photos depuis la galerie", async ({ page }) => {
  const album = await mockAlbum(page, { photos: [{ id: "a" }] });
  await openMyPhoto(page);
  await expect(page.getByTestId("printer-status")).toBeVisible();

  const print = page.getByRole("button", { name: "Imprimer", exact: true });
  await print.dblclick();

  // A pill, no step-by-step tracking (SCRUM-55).
  await expect(printState(page)).toHaveText("En attente de validation");
  await expect(page.getByRole("list", { name: "Étapes de l'impression" })).toHaveCount(0);
  await expect(print).toHaveCount(0);
  expect(album.created).toHaveLength(1);
  expect(album.created[0].p_photo_id).toBe("a");
});

test("une demande annulée peut être refaite", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "CANCELLED", "a")] });
  await openMyPhoto(page);

  await expect(page.getByText("Votre précédente demande a été annulée")).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeEnabled();
});

/**
 * SCRUM-63 — Scenario: Pas de réimpression
 *   Given ma photo a déjà été imprimée
 *   When je l'ouvre en grand
 *   Then aucun bouton "Imprimer" n'est proposé
 */
for (const status of ["DONE", "PENDING", "PRINTING"] as const) {
  test(`pas de nouvelle impression d'une photo déjà demandée (${status})`, async ({ page }) => {
    await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", status, "a")] });
    await openMyPhoto(page);

    await expect(printState(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toHaveCount(0);
  });
}

test("impressions en pause : bouton désactivé et message clair", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }] });
  await page.route("**/rest/v1/rpc/get_print_availability", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '"paused"' })
  );
  await openMyPhoto(page);

  await expect(page.getByRole("status").filter({ hasText: "en pause" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeDisabled();
});

test("retour : de ma photo à la galerie, au même endroit", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }, { id: "b" }] });
  await openMyPhoto(page);

  await viewer(page).getByRole("button", { name: "Galerie" }).click();

  await expect(page.getByRole("heading", { name: "Galerie", exact: true })).toBeVisible();
  await expect(myTiles(page)).toHaveCount(2);
});

/**
 * SCRUM-64 — Scenario: Seule la photo est affichée
 *   Given je suis sur la Galerie avec une de mes photos
 *   When je l'ouvre
 *   Then je vois ma photo en grand (SCRUM-55 : la visionneuse)
 *   And la grille de la Galerie n'est pas visible
 */
test("ma photo ouverte : la grille de la galerie n'est plus affichée dessous", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }, { id: "b" }] });
  await openMyPhoto(page);

  await expect(page.getByTestId("gallery-screen")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Galerie", exact: true })).toBeHidden();
  await expect(myTiles(page).first()).toBeHidden();
});

/**
 * SCRUM-64 — Scenario: Retour à la même position
 *   Given j'ai fait défiler la Galerie puis ouvert une de mes photos
 *   When je touche "Galerie"
 *   Then je retrouve la grille à la même position
 */
test("retour de ma photo : la grille revient à la même position", async ({ page }) => {
  const photos = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}` }));
  await mockAlbum(page, { photos });
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  await page.goto(GALLERY);
  await expect(myTiles(page)).toHaveCount(30);

  await myTiles(page).last().scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(200);
  await myTiles(page).last().click();
  await expect(viewer(page).getByRole("img", { name: "Votre photo" })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await viewer(page).getByRole("button", { name: "Galerie" }).click();

  await expect(myTiles(page).last()).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test("seules mes photos de cet événement servent au suivi", async ({ page }) => {
  const album = await mockAlbum(page, { photos: [{ id: "a" }] });
  await openHome(page);
  await expect.poll(() => album.photoQueries.length).toBeGreaterThan(0);

  expect(album.photoQueries[0]).toContain(`event_id=eq.${TEST_EVENT.id}`);
  expect(album.photoQueries[0]).toContain(`guest_id=eq.${GUEST_ID}`);
  expect(album.photoQueries[0]).toContain("deleted_at=is.null");
  expect(album.jobQueries[0]).toContain(`event_id=eq.${TEST_EVENT.id}`);
});

// ---- The print banner on the home (SCRUM-47, kept) ----

test("accueil : bandeau d'impression sous les deux actions (SCRUM-57)", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }, { id: "b" }, { id: "c" }],
    jobs: [fakeJob("j1", "PRINTING", "b")],
  });
  await openHome(page);

  await expect(banner(page)).toContainText("en cours d'impression");
  const [bannerBox, importBox] = [
    await banner(page).boundingBox(),
    await page.getByRole("button", { name: "Importer une photo" }).boundingBox(),
  ];
  expect(bannerBox!.y).toBeGreaterThan(importBox!.y);
});

test("sans impression en cours, aucun bandeau", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }, { id: "b" }],
    jobs: [fakeJob("j1", "CANCELLED", "a")],
  });
  await openHome(page);
  await expect.poll(() => banner(page).count()).toBe(0);
});

test("une photo prête depuis longtemps ne s'affiche plus en bandeau", async ({ page }) => {
  const album = await mockAlbum(page, {
    photos: [{ id: "a" }],
    jobs: [fakeJob("j1", "DONE", "a", "2026-11-06T12:00:00.000Z")],
  });
  await openHome(page);
  await expect.poll(() => album.jobQueries.length).toBeGreaterThan(0);

  await expect(banner(page)).toHaveCount(0);
});

test("le bandeau ouvre « Vos tirages », puis la photo, et l'on revient pas à pas", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "DONE", "a")] });
  await openHome(page);

  await expect(banner(page)).toContainText("prête");
  await banner(page).click();
  await expect(page.getByRole("heading", { name: "Vos tirages" })).toBeVisible();

  await page.getByTestId("print-card").click();
  await expect(page.getByRole("heading", { name: "Votre photo" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Étapes de l'impression" })).toBeVisible();

  await page.getByRole("button", { name: "Vos tirages" }).click();
  await expect(page.getByRole("heading", { name: "Vos tirages" })).toBeVisible();
  await page.getByRole("button", { name: "Accueil" }).click();
  await expect(page.getByRole("button", { name: "Prendre une photo" })).toBeVisible();
});

test("le bandeau se met à jour tout seul quand la photo est prête", async ({ page }) => {
  const album = await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PRINTING", "a")] });
  await openHome(page);
  await expect(banner(page)).toContainText("en cours d'impression");

  album.jobs = [fakeJob("j1", "DONE", "a")];
  await page.clock.runFor(POLL_MS);

  await expect(banner(page)).toContainText("Votre photo est prête");
  await expect(banner(page)).toContainText("À récupérer près de l'imprimante");
});

for (const status of ["STUCK", "FAILED"] as const) {
  test(`problème (${status}) : message rassurant, sans jargon`, async ({ page }) => {
    await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", status, "a")] });
    await openHome(page);
    await expect(banner(page)).toContainText("équipe");

    await banner(page).click();
    await page.getByTestId("print-card").click();

    await expect(page.getByRole("status").filter({ hasText: guestStatusLabel(status) })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(RAW);
  });
}

test("imprimante hors ligne : visible sur le détail d'une photo", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }],
    jobs: [fakeJob("j1", "PENDING", "a")],
    printerOnline: false,
  });
  await openHome(page);
  await banner(page).click();

  await expect(page.getByTestId("printer-status")).toContainText(
    "L'imprimante n'est pas connectée pour le moment"
  );
});

test("après un rechargement, le bandeau est retrouvé", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "DONE", "a")] });
  await openHome(page);
  await expect(banner(page)).toBeVisible();

  await page.reload();

  await expect(banner(page)).toContainText("prête");
});

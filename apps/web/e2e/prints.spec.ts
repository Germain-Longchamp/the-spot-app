import { test, expect, Page } from "@playwright/test";
import { fakeJob, mockAlbum } from "./support/album-mocks";
import { mockGuestBackend } from "./support/guest-mocks";

// SCRUM-53 — "Vos tirages": one card per print, with its place in the queue.

const URL = "/e/jeton-de-test";
const RAW = /PENDING|PRINTING|DONE|STUCK|FAILED|CANCELLED/;
const POLL_MS = 5_000;

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-06T14:00:00Z") });
});

const banner = (page: Page) => page.getByTestId("print-banner");
const cards = (page: Page) => page.getByTestId("print-card");

/** From the home, through the banner, as a guest does. */
async function openPrints(page: Page) {
  await mockGuestBackend(page);
  await page.goto(URL);
  await banner(page).click();
  await expect(page.getByRole("heading", { name: "Vos tirages" })).toBeVisible();
}

/**
 * Scenario: Accès depuis l'accueil
 *   Given j'ai un tirage en attente
 *   When je touche le bandeau de l'accueil
 *   Then la page "Vos tirages" s'ouvre
 */
test("le bandeau de l'accueil ouvre « Vos tirages »", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 2 } });
  await mockGuestBackend(page);
  await page.goto(URL);

  await expect(banner(page)).toContainText("2 photos avant la vôtre");
  await banner(page).click();

  await expect(page.getByText("File d'impression")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vos tirages" })).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  // The printer's state stays in sight (UX rule 1).
  await expect(page.getByTestId("printer-status")).toBeVisible();
});

/**
 * Scenario: Position d'un tirage en attente
 *   Given 2 demandes de l'événement sont en attente avant la mienne
 *   When j'ouvre "Vos tirages"
 *   Then ma carte affiche "2 photos avant la vôtre"
 */
test("position : « 2 photos avant la vôtre »", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 2 } });
  await openPrints(page);

  await expect(cards(page).first()).toContainText("En attente");
  await expect(cards(page).first()).toContainText("2 photos avant la vôtre");
});

/**
 * Scenario: Prochaine à imprimer
 *   Given aucune demande en attente avant la mienne
 *   Then ma carte affiche "C'est la prochaine"
 */
test("aucune demande avant : « C'est la prochaine »", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 0 } });
  await openPrints(page);

  await expect(cards(page).first()).toContainText("C'est la prochaine");
});

/**
 * Scenario: La position avance seule
 *   Given ma carte affiche "2 photos avant la vôtre"
 *   When l'équipe imprime une demande arrivée avant la mienne
 *   Then ma carte affiche "1 photo avant la vôtre" sans que je recharge la page
 */
test("la position avance seule, sans recharger", async ({ page }) => {
  const album = await mockAlbum(page, {
    photos: [{ id: "a" }],
    jobs: [fakeJob("j1", "PENDING", "a")],
    ahead: { a: 2 },
  });
  await openPrints(page);
  await expect(cards(page).first()).toContainText("2 photos avant la vôtre");

  album.ahead = { a: 1 };
  await page.clock.runFor(POLL_MS);

  await expect(cards(page).first()).toContainText("1 photo avant la vôtre");
});

/**
 * Scenario: Plusieurs tirages
 *   Given j'ai un tirage prêt et deux en attente
 *   When j'ouvre "Vos tirages"
 *   Then je vois "1 prêt · 2 en attente" et une carte par tirage, le tirage prêt en premier
 */
test("plusieurs tirages : résumé, une carte chacun, le prêt d'abord", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }, { id: "b" }, { id: "c" }],
    jobs: [
      fakeJob("j3", "PENDING", "c", "2026-11-06T13:50:00.000Z"),
      fakeJob("j2", "PENDING", "b", "2026-11-06T13:45:00.000Z"),
      fakeJob("j1", "DONE", "a", "2026-11-06T13:40:00.000Z"),
    ],
    ahead: { b: 0, c: 3 },
  });
  await openPrints(page);

  await expect(page.getByTestId("prints-summary")).toHaveText("1 prêt · 2 en attente");
  await expect(cards(page)).toHaveCount(3);
  await expect(cards(page).nth(0)).toContainText("Prête à récupérer");
  // The queue in its order: the next one first.
  await expect(cards(page).nth(1)).toContainText("C'est la prochaine");
  await expect(cards(page).nth(2)).toContainText("3 photos avant la vôtre");
});

/**
 * Scenario: Tirage prêt
 *   Given mon tirage est imprimé
 *   Then sa carte affiche "Elle vous attend près de l'imprimante"
 */
test("tirage prêt : « Elle vous attend près de l'imprimante »", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "DONE", "a")] });
  await openPrints(page);

  await expect(cards(page).first()).toContainText("Prête à récupérer");
  await expect(cards(page).first()).toContainText("Elle vous attend près de l'imprimante");
});

/**
 * Scenario: Page fermée puis rouverte
 *   Given j'ai un tirage en attente et je ferme l'onglet
 *   When je rescanne le QR code
 *   Then je retrouve mon tirage et sa position
 */
test("page rouverte : le tirage et sa position sont retrouvés", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 1 } });
  await openPrints(page);

  await page.goto(URL);
  await banner(page).click();

  await expect(cards(page).first()).toContainText("1 photo avant la vôtre");
});

test("souci : pas de position, on va voir l'équipe, sans jargon", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "STUCK", "a")] });
  await openPrints(page);

  await expect(cards(page).first()).toContainText("rendez-vous auprès de l'équipe");
  await expect(cards(page).first()).not.toContainText("avant la vôtre");
  await expect(page.locator("body")).not.toContainText(RAW);
});

test("position illisible : la carte reste, en attente de l'équipe", async ({ page }) => {
  const album = await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")] });
  await page.route("**/rest/v1/rpc/guest_queue_positions", (route) => route.fulfill({ status: 500 }));
  await openPrints(page);

  await expect(cards(page).first()).toContainText("En attente de validation par l'équipe");
  expect(album.positionQueries).toBe(0);
});

test("réseau coupé : dernier état connu, et on le dit", async ({ page }) => {
  const album = await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 2 } });
  await openPrints(page);
  await expect(cards(page).first()).toContainText("2 photos avant la vôtre");

  album.fail = true;
  // The client retries a failed read, each retry after a network answer:
  // move the clock step by step until it gives up.
  const notice = page.getByText("Mise à jour impossible pour le moment");
  await expect
    .poll(async () => {
      await page.clock.runFor(10_000);
      return notice.isVisible();
    }, { timeout: 30_000 })
    .toBe(true);
  await expect(cards(page).first()).toContainText("2 photos avant la vôtre");
});

test("impressions en pause : la position reste, avec un mot", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }],
    jobs: [fakeJob("j1", "PENDING", "a")],
    ahead: { a: 2 },
    availability: "paused",
  });
  await openPrints(page);

  await expect(cards(page).first()).toContainText("2 photos avant la vôtre");
  await expect(cards(page).first()).toContainText("Les impressions reprennent bientôt");
});

test("message rassurant et « Prendre une autre photo »", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 0 } });
  await openPrints(page);

  await expect(page.getByText("Vous pouvez fermer cette page : vos tirages restent suivis.")).toBeVisible();
  await page.getByRole("button", { name: "Prendre une autre photo" }).click();
  await expect(page.getByRole("button", { name: "Prendre une autre photo" })).toHaveCount(0);
});

test("seules mes demandes en attente déclenchent la lecture de la file", async ({ page }) => {
  const album = await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "DONE", "a")] });
  await openPrints(page);
  await expect(cards(page)).toHaveCount(1);

  expect(album.positionQueries).toBe(0);
});

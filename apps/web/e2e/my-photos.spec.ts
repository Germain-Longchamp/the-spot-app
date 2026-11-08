import { test, expect, Page } from "@playwright/test";
import { guestStatusLabel, PrintJobStatus } from "../lib/print/job-status";
import { fakeJob, mockAlbum } from "./support/album-mocks";
import { GUEST_ID, mockGuestBackend, TEST_EVENT } from "./support/guest-mocks";

const URL = "/e/jeton-de-test";
const RAW = /PENDING|PRINTING|DONE|STUCK|FAILED|CANCELLED/;
const POLL_MS = 5_000;

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-06T14:00:00Z") });
});

async function openHome(page: Page) {
  await mockGuestBackend(page);
  await page.goto(URL);
  await expect(page.getByRole("button", { name: "Prendre une photo" })).toBeVisible();
}

const entry = (page: Page) => page.getByRole("button", { name: /^Mes photos/ });
const banner = (page: Page) => page.getByTestId("print-banner");
const items = (page: Page) => page.getByTestId("album-item");

async function openAlbum(page: Page) {
  await entry(page).click();
  await expect(page.getByRole("heading", { name: "Mes photos" })).toBeVisible();
}

async function openFirstPhoto(page: Page) {
  await openAlbum(page);
  await items(page).first().click();
  await expect(page.getByRole("heading", { name: "Votre photo" })).toBeVisible();
}

/**
 * Scenario: Accueil allégé
 *   Given j'ai trois photos, dont une en impression
 *   Then je vois un bandeau "Impression en cours" en haut
 *   And une carte "Mes photos (3)" avec des mini-vignettes
 *   And les sections "Vos impressions" et "Vos photos" ne sont plus affichées
 */
test("accueil : bandeau d'impression en haut et carte « Mes photos (3) »", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }, { id: "b" }, { id: "c" }],
    jobs: [fakeJob("j1", "PRINTING", "b")],
  });
  await openHome(page);

  await expect(banner(page)).toContainText("en cours d'impression");
  await expect(entry(page)).toHaveAccessibleName("Mes photos (3)");
  const [bannerBox, logoBox] = [
    await banner(page).boundingBox(),
    await page.getByRole("img", { name: "The Spot Memories" }).boundingBox(),
  ];
  expect(bannerBox!.y).toBeLessThan(logoBox!.y);
  await expect(page.getByRole("heading", { name: "Vos photos" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Vos impressions" })).toHaveCount(0);
  await expect(page.getByTestId("my-prints")).toHaveCount(0);
});

/**
 * Scenario: Pas d'impression en cours
 *   Then aucun bandeau d'impression n'est affiché
 */
test("sans impression en cours, aucun bandeau", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }, { id: "b" }],
    jobs: [fakeJob("j1", "CANCELLED", "a")],
  });
  await openHome(page);

  await expect(entry(page)).toHaveAccessibleName("Mes photos (2)");
  await expect(banner(page)).toHaveCount(0);
});

test("une photo prête depuis longtemps ne s'affiche plus en bandeau", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }],
    jobs: [fakeJob("j1", "DONE", "a", "2026-11-06T12:00:00.000Z")],
  });
  await openHome(page);

  await expect(entry(page)).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
});

test("le bandeau ouvre la photo concernée", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "DONE", "a")] });
  await openHome(page);

  await expect(banner(page)).toContainText("prête");
  await banner(page).click();

  await expect(page.getByRole("heading", { name: "Votre photo" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Étapes de l'impression" })).toBeVisible();
});

/**
 * Scenario: Photos et impressions reliées
 *   Then chaque photo affiche l'état de sa dernière impression en clair, ou "Non imprimée"
 *   And les photos publiées portent le badge "Dans la galerie"
 *   And les photos prêtes à récupérer apparaissent en premier
 */
test("« Mes photos » : chaque photo avec l'état de sa dernière impression", async ({ page }) => {
  await mockAlbum(page, {
    photos: [
      { id: "jamais", created_at: "2026-11-06T13:50:00.000Z", is_published: true },
      { id: "attente", created_at: "2026-11-06T13:40:00.000Z" },
      { id: "prete", created_at: "2026-11-06T13:10:00.000Z" },
    ],
    jobs: [
      // Newest first, as the query asks: the latest request wins.
      fakeJob("j3", "PENDING", "attente", "2026-11-06T13:45:00.000Z"),
      fakeJob("j2", "DONE", "prete", "2026-11-06T13:20:00.000Z"),
      fakeJob("j1", "CANCELLED", "attente", "2026-11-06T13:41:00.000Z"),
    ],
  });
  await openHome(page);
  await openAlbum(page);

  await expect(items(page)).toHaveCount(3);
  await expect(items(page).nth(0)).toContainText("Prête à récupérer");
  await expect(items(page).nth(1)).toContainText("En attente de validation");
  await expect(items(page).nth(2)).toContainText("Non imprimée");
  await expect(items(page).nth(2)).toContainText("Dans la galerie");
  await expect(items(page).nth(1)).not.toContainText("Dans la galerie");
  await expect(page.locator("body")).not.toContainText(RAW);
});

test("seules mes photos de cet événement sont demandées", async ({ page }) => {
  const album = await mockAlbum(page, { photos: [{ id: "a" }] });
  await openHome(page);
  await expect(entry(page)).toBeVisible();

  expect(album.photoQueries[0]).toContain(`event_id=eq.${TEST_EVENT.id}`);
  expect(album.photoQueries[0]).toContain(`guest_id=eq.${GUEST_ID}`);
  expect(album.photoQueries[0]).toContain("deleted_at=is.null");
  expect(album.jobQueries[0]).toContain(`event_id=eq.${TEST_EVENT.id}`);
});

/**
 * Scenario: Imprimer une photo jamais imprimée
 *   When j'ouvre son détail et j'appuie sur "Imprimer"
 *   Then une demande d'impression est créée pour cette photo
 *   And son suivi en étapes s'affiche
 */
test("imprimer une photo jamais imprimée depuis son détail", async ({ page }) => {
  const album = await mockAlbum(page, { photos: [{ id: "a" }] });
  await openHome(page);
  await openFirstPhoto(page);
  await expect(page.getByTestId("printer-status")).toBeVisible();

  const print = page.getByRole("button", { name: "Imprimer", exact: true });
  await print.dblclick();

  await expect(page.getByRole("list", { name: "Étapes de l'impression" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: guestStatusLabel("PENDING") })).toBeVisible();
  await expect(print).toHaveCount(0);
  expect(album.created).toHaveLength(1);
  expect(album.created[0].p_photo_id).toBe("a");
});

test("une demande annulée peut être refaite", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "CANCELLED", "a")] });
  await openHome(page);
  await openFirstPhoto(page);

  await expect(page.getByText("Votre précédente demande a été annulée")).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeEnabled();
});

/**
 * Scenario: Pas de réimpression
 *   Given une de mes photos a déjà été imprimée
 *   Then aucun bouton "Imprimer" n'est proposé
 */
for (const status of ["DONE", "PENDING", "PRINTING"] as const) {
  test(`pas de nouvelle impression d'une photo déjà demandée (${status})`, async ({ page }) => {
    await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", status, "a")] });
    await openHome(page);
    await openFirstPhoto(page);

    await expect(page.getByRole("list", { name: "Étapes de l'impression" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toHaveCount(0);
  });
}

test("impressions en pause : bouton désactivé et message clair", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }] });
  await page.route("**/rest/v1/rpc/get_print_availability", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '"paused"' })
  );
  await openHome(page);
  await openFirstPhoto(page);

  await expect(page.getByRole("status").filter({ hasText: "en pause" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeDisabled();
});

/**
 * Scenario: Aucune photo
 *   Then aucune carte "Mes photos" n'est affichée
 */
test("sans photo, ni carte ni bandeau", async ({ page }) => {
  await mockAlbum(page);
  await openHome(page);

  await expect(entry(page)).toHaveCount(0);
  await expect(banner(page)).toHaveCount(0);
});

test("le bandeau se met à jour tout seul quand la photo est prête", async ({ page }) => {
  const album = await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PRINTING", "a")] });
  await openHome(page);
  await expect(banner(page)).toContainText("en cours d'impression");

  album.jobs = [fakeJob("j1", "DONE", "a")];
  await page.clock.runFor(POLL_MS);

  await expect(banner(page)).toContainText("prête : à récupérer près de l'imprimante");
});

for (const status of ["STUCK", "FAILED"] as const) {
  test(`problème (${status}) : message rassurant, sans jargon`, async ({ page }) => {
    await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", status, "a")] });
    await openHome(page);
    await expect(banner(page)).toContainText("équipe");

    await openFirstPhoto(page);

    await expect(page.getByRole("status").filter({ hasText: guestStatusLabel(status) })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(RAW);
  });
}

test("chaque état s'affiche en langage clair", async ({ page }) => {
  const all: PrintJobStatus[] = ["PENDING", "PRINTING", "DONE", "STUCK", "FAILED", "CANCELLED"];
  await mockAlbum(page, {
    photos: all.map((status) => ({ id: status.toLowerCase() })),
    jobs: all.map((status, i) => fakeJob(`j${i}`, status, status.toLowerCase())),
  });
  await openHome(page);
  await openAlbum(page);

  await expect(items(page)).toHaveCount(all.length);
  await expect(page.locator("body")).not.toContainText(RAW);
  for (const label of ["Prête à récupérer", "voyez l'équipe", "Impression en cours", "En attente de validation", "Annulée"]) {
    await expect(page.getByText(label).first()).toBeVisible();
  }
});

test("imprimante hors ligne : visible sur le détail d'une photo", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }],
    jobs: [fakeJob("j1", "PENDING", "a")],
    printerOnline: false,
  });
  await openHome(page);
  await openFirstPhoto(page);

  await expect(page.getByTestId("printer-status")).toContainText(
    "L'imprimante n'est pas connectée pour le moment"
  );
});

test("connexion perdue : dernier état connu, avec une mention claire", async ({ page }) => {
  const album = await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PRINTING", "a")] });
  await openHome(page);
  await openAlbum(page);
  await expect(items(page)).toContainText("Impression en cours");

  album.fail = true;
  // The Supabase client retries a failed read before giving up.
  await page.clock.runFor(POLL_MS + 40_000);

  await expect(page.getByText("Connexion perdue")).toBeVisible();
  await expect(items(page)).toContainText("Impression en cours");

  album.fail = false;
  album.jobs = [fakeJob("j1", "DONE", "a")];
  await page.clock.runFor(POLL_MS * 2);

  await expect(page.getByText("Connexion perdue")).toHaveCount(0);
  await expect(items(page)).toContainText("Prête à récupérer");
});

test("après un rechargement, les photos et leur état sont retrouvés", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "DONE", "a")] });
  await openHome(page);
  await expect(banner(page)).toBeVisible();

  await page.reload();

  await expect(banner(page)).toContainText("prête");
  await expect(entry(page)).toHaveAccessibleName("Mes photos (1)");
});

test("fichier disparu : carte sans image, état toujours lisible", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")] });
  await page.route("**/storage/v1/object/sign/photos", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await openHome(page);
  await openAlbum(page);

  await expect(items(page).first()).toContainText("Photo indisponible");
  await expect(items(page).first()).toContainText("En attente de validation");
});

test("retours : détail → « Mes photos » → accueil", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }] });
  await openHome(page);
  await openFirstPhoto(page);

  await page.getByRole("button", { name: "Mes photos" }).click();
  await expect(page.getByRole("heading", { name: "Mes photos" })).toBeVisible();
  await page.getByRole("button", { name: "Accueil" }).click();

  await expect(page.getByRole("button", { name: "Prendre une photo" })).toBeVisible();
});

test("petit écran 320 x 568 : la grille ne déborde pas", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockAlbum(page, { photos: [{ id: "a" }, { id: "b" }, { id: "c" }], jobs: [fakeJob("j1", "STUCK", "a")] });
  await openHome(page);
  await openAlbum(page);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

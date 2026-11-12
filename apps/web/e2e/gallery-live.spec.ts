import { test, expect, Page } from "@playwright/test";
import { json, mockGuestBackend } from "./support/guest-mocks";
import { mockGallery } from "./support/gallery-mocks";
import { GALLERY_POLL_INTERVAL_MS } from "../lib/guest/gallery";

// SCRUM-54 — the gallery keeps itself fresh: no "Actualiser" any more.

const GALLERY = "/e/jeton-de-test/galerie";
const POLL = GALLERY_POLL_INTERVAL_MS;

test.use({
  viewport: { width: 390, height: 844 },
  // Chrome's fake camera, for the "Prendre une photo" button (none on CI).
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

const thumbs = (page: Page) => page.getByTestId("gallery-photo");
const pill = (page: Page) => page.getByRole("button", { name: /nouvelles? photos?$/ });
/** Which photo a tile shows, from its signed thumbnail link. */
const idOf = async (page: Page, index: number) =>
  (await thumbs(page).nth(index).locator("img").getAttribute("src"))!.match(/\/(p[\w-]+)-thumb\.jpg/)![1];

async function openGallery(
  page: Page,
  ids: string[],
  options: { mine?: string[]; shown?: number } = {}
) {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  await page.route("**/rest/v1/print_jobs?**", (route) => json(route, []));
  const gallery = await mockGallery(page, ids, options);
  await page.clock.install({ time: new Date("2026-11-06T14:00:00Z") });
  await page.goto(GALLERY);
  await expect(thumbs(page)).toHaveCount(options.shown ?? ids.length);
  return gallery;
}

const many = (n: number, prefix = "p") => Array.from({ length: n }, (_, i) => `${prefix}${n - i}`);

/**
 * Scenario: Plus de bouton Actualiser
 *   When j'ouvre la galerie
 *   Then aucun bouton "Actualiser" n'est affiché
 */
test("plus de bouton « Actualiser »", async ({ page }) => {
  await openGallery(page, ["p1"]);

  await expect(page.getByRole("button", { name: "Actualiser" })).toHaveCount(0);
});

test("titre « Galerie », nombre de photos, bouton « Prendre une photo »", async ({ page }) => {
  await openGallery(page, ["p2", "p1"]);
  await page.clock.runFor(POLL);

  await expect(page.getByRole("heading", { name: "Galerie", exact: true })).toBeVisible();
  await expect(page.getByTestId("gallery-total")).toHaveText("2 photos");
  await expect(page.getByRole("link", { name: "Prendre une photo" })).toBeInViewport();
});

/**
 * Scenario: Nouvelles photos pendant le défilement
 *   Given j'ai fait défiler la galerie vers le bas
 *   When 3 photos sont publiées par d'autres invités
 *   Then la pastille "3 nouvelles photos" apparaît sans que la grille bouge
 *   When je touche la pastille
 *   Then la page remonte en haut et les 3 photos sont affichées en premier
 */
test("nouvelles photos pendant le défilement : pastille, puis en tête", async ({ page }) => {
  const gallery = await openGallery(page, many(24));
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  const scrolled = await page.evaluate(() => window.scrollY);
  const first = await idOf(page, 0);

  gallery.ids = ["pn3", "pn2", "pn1", ...gallery.ids];
  await page.clock.runFor(POLL);

  await expect(pill(page)).toHaveText("3 nouvelles photos");
  // Nothing moved under the finger.
  expect(await idOf(page, 0)).toBe(first);
  // A pixel of rounding is no jump (CI, 2026-11-12: 437 for 438).
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrolled)).toBeLessThanOrEqual(2);
  await expect(thumbs(page)).toHaveCount(24);

  await pill(page).click();

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(thumbs(page)).toHaveCount(27);
  expect([await idOf(page, 0), await idOf(page, 1), await idOf(page, 2)]).toEqual(["pn3", "pn2", "pn1"]);
  await expect(pill(page)).toHaveCount(0);
});

test("revenu en haut tout seul : les nouvelles photos entrent", async ({ page }) => {
  const gallery = await openGallery(page, many(24));
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  gallery.ids = ["pn1", ...gallery.ids];
  await page.clock.runFor(POLL);
  await expect(pill(page)).toHaveText("1 nouvelle photo");

  await page.evaluate(() => window.scrollTo(0, 0));

  await expect(thumbs(page)).toHaveCount(25);
  expect(await idOf(page, 0)).toBe("pn1");
});

/**
 * Scenario: Nouvelles photos en haut de page
 *   Given je suis en haut de la galerie
 *   When une photo est publiée
 *   Then elle apparaît en premier sans action de ma part
 */
test("en haut de page : la nouvelle photo apparaît d'elle-même, en premier", async ({ page }) => {
  const gallery = await openGallery(page, ["p2", "p1"]);

  gallery.ids = ["pn1", ...gallery.ids];
  await page.clock.runFor(POLL);

  await expect(thumbs(page)).toHaveCount(3);
  expect(await idOf(page, 0)).toBe("pn1");
  await expect(pill(page)).toHaveCount(0);
});

/**
 * Scenario: Mes photos repérées
 *   Given j'ai publié une photo
 *   Then sa vignette porte la pastille "Vous" et pas celles des autres
 */
test("« Vous » sur mes photos seulement", async ({ page }) => {
  await openGallery(page, ["p3", "p2", "p1"], { mine: ["p2"] });

  const tiles = page.locator("li").filter({ has: thumbs(page) });
  await expect(tiles.nth(1)).toContainText("Vous");
  await expect(tiles.nth(0)).not.toContainText("Vous");
  await expect(tiles.nth(2)).not.toContainText("Vous");
});

/**
 * Scenario: Photo supprimée par l'équipe
 *   Given une photo est affichée dans ma galerie
 *   When l'équipe la supprime
 *   Then elle disparaît de ma galerie au rafraîchissement suivant
 */
test("photo supprimée par l'équipe : partie au rafraîchissement suivant", async ({ page }) => {
  const gallery = await openGallery(page, ["p3", "p2", "p1"]);

  gallery.ids = ["p3", "p1"];
  await page.clock.runFor(POLL);

  await expect(thumbs(page)).toHaveCount(2);
  expect([await idOf(page, 0), await idOf(page, 1)]).toEqual(["p3", "p1"]);
});

test("photos chargées en plusieurs pages : toutes gardées au rafraîchissement", async ({ page }) => {
  // 30 photos: one page of 24 first.
  await openGallery(page, many(30), { shown: 24 });
  await page.getByRole("button", { name: "Voir plus de photos" }).click();
  await expect(thumbs(page)).toHaveCount(30);

  await page.clock.runFor(POLL);

  await expect(thumbs(page)).toHaveCount(30);
});

test("réseau coupé : la grille reste, petit message, puis reprise seule", async ({ page }) => {
  const gallery = await openGallery(page, ["p2", "p1"]);

  gallery.fail = true;
  // The client retries a failed read, each retry after a network answer.
  const notice = page.getByText("Connexion perdue, nouvelle tentative…");
  await expect
    .poll(async () => {
      await page.clock.runFor(POLL);
      return notice.isVisible();
    }, { timeout: 30_000 })
    .toBe(true);
  await expect(thumbs(page)).toHaveCount(2);

  gallery.fail = false;
  gallery.ids = ["pn1", ...gallery.ids];
  await expect
    .poll(async () => {
      await page.clock.runFor(POLL);
      return thumbs(page).count();
    }, { timeout: 30_000 })
    .toBe(3);
  await expect(notice).toHaveCount(0);
});

test("onglet caché : la galerie ne lit plus rien", async ({ page }) => {
  const gallery = await openGallery(page, ["p1"]);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const before = gallery.queries.length;

  await page.clock.runFor(POLL * 3);

  expect(gallery.queries.length).toBe(before);
});

test("« Prendre une photo » ouvre la caméra depuis l'accueil", async ({ page }) => {
  await openGallery(page, ["p1"]);

  await page.getByRole("link", { name: "Prendre une photo" }).click();

  await expect(page).toHaveURL(/\/e\/jeton-de-test$/);
  await expect(page.getByRole("button", { name: "Prendre la photo" })).toBeVisible();
});

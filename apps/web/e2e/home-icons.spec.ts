import { test, expect, Locator, Page } from "@playwright/test";
import { fakeJob, mockAlbum } from "./support/album-mocks";
import { mockGuestBackend } from "./support/guest-mocks";

// SCRUM-68 — one size for every icon tile of the guest home.

const URL = "/e/jeton-de-test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

// The fake prints are dated from this clock: a print collected long ago is no news.
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-06T14:00:00Z") });
});

async function openHome(page: Page) {
  await mockGuestBackend(page);
  await page.goto(URL);
  await expect(page.getByRole("button", { name: "Prendre une photo" })).toBeVisible();
}

const takePhoto = (page: Page) => page.getByRole("button", { name: "Prendre une photo" });
const importPhoto = (page: Page) => page.getByRole("button", { name: "Importer une photo" });
const banner = (page: Page) => page.getByTestId("print-banner");
const gallery = (page: Page) => page.getByRole("link", { name: /Voir la galerie|Vos photos/ });

/** The tile of a block, and the icon (or spinner) it holds, both measured. */
async function tileOf(block: Locator) {
  const tile = block.getByTestId("icon-tile");
  await expect(tile).toHaveCount(1);
  const content = tile.locator("> *");
  const [outer, inner] = await Promise.all([tile.boundingBox(), content.boundingBox()]);
  return { outer: outer!, inner: inner! };
}

function expectHarmonised({ outer, inner }: Awaited<ReturnType<typeof tileOf>>) {
  expect(outer.width).toBeCloseTo(44, 0);
  expect(outer.height).toBeCloseTo(44, 0);
  expect(inner.width).toBeCloseTo(24, 0);
  expect(inner.height).toBeCloseTo(24, 0);
  // Centred: same room on each side, to the pixel.
  expect(Math.abs(inner.x - outer.x - (outer.x + outer.width - inner.x - inner.width))).toBeLessThanOrEqual(1);
  expect(Math.abs(inner.y - outer.y - (outer.y + outer.height - inner.y - inner.height))).toBeLessThanOrEqual(1);
}

/**
 * Scenario: Toutes les pastilles de l'accueil ont la même taille
 *   Given il a au moins une impression en cours
 *   Then les quatre pastilles mesurent 44 x 44 px, chaque icône 24 x 24 px, centrée
 * Scenario: La galerie a sa pastille
 */
for (const status of ["PENDING", "DONE"] as const) {
  test(`accueil avec un tirage ${status} : quatre pastilles identiques`, async ({ page }) => {
    await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", status, "a")], ahead: { a: 1 } });
    await openHome(page);
    await expect(banner(page)).toBeVisible();

    for (const block of [takePhoto(page), importPhoto(page), banner(page), gallery(page)]) {
      expectHarmonised(await tileOf(block));
    }
  });
}

/**
 * Scenario: Le chargement de l'import garde la même taille
 *   When « Patientez… » s'affiche
 *   Then le cercle de chargement mesure 24 x 24 px dans une pastille de 44 x 44 px
 */
test("import en cours : le cercle de chargement garde la taille de l'icône", async ({ page }) => {
  // A turning spinner has a wider box: measure it at rest.
  await page.emulateMedia({ reducedMotion: "reduce" });
  // The photo is still being read: hold it there.
  await page.addInitScript(() => {
    window.createImageBitmap = () => new Promise(() => {});
  });
  await openHome(page);

  await page.getByLabel("Choisir une photo").setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  const busy = page.getByRole("button", { name: "Patientez…" });
  await expect(busy).toBeDisabled();

  expectHarmonised(await tileOf(busy));
});

/** Cas limite : petit téléphone, les deux actions restent visibles sans défiler. */
test("320 x 568 avec bandeau : les deux actions sans défiler", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 1 } });
  await openHome(page);
  await expect(banner(page)).toBeVisible();

  for (const action of [takePhoto(page), importPhoto(page)]) {
    const box = (await action.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(568);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

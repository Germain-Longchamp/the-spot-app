import { test, expect, Page } from "@playwright/test";
import { GALLERY_PAGE_SIZE, GONE_DELAY_MS } from "../lib/guest/gallery";
import { fakeJob, FakeJob, mockAlbum } from "./support/album-mocks";
import { json, mockGuestBackend, TEST_EVENT } from "./support/guest-mocks";
import { mockGallery } from "./support/gallery-mocks";

// SCRUM-55 — Photo en grand: one viewer for every photo of the gallery, with
// swipe, arrows, a counter, and the guest's own print state as a pill.

const GALLERY = "/e/jeton-de-test/galerie";

test.use({ viewport: { width: 390, height: 844 } });

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

/** The gallery, open, with these photos (newest first); `mine` are the guest's. */
async function openGallery(
  page: Page,
  photos: string[],
  options: { mine?: string[]; jobs?: FakeJob[]; event?: Partial<typeof TEST_EVENT> } = {}
) {
  const mine = options.mine ?? [];
  const album = await mockAlbum(page, { photos: mine.map((id) => ({ id })), jobs: options.jobs });
  await mockGuestBackend(page, {
    event: { gallery_enabled: true, gallery_visible: true, ...options.event },
  });
  if (!mine.length) {
    await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  }
  // Registered last: the gallery view mixes the guest's photos with the others.
  const gallery = await mockGallery(page, photos, { mine });
  await page.goto(GALLERY);
  await expect(tiles(page)).toHaveCount(Math.min(photos.length, GALLERY_PAGE_SIZE));
  return { album, gallery };
}

const tiles = (page: Page) => page.getByTestId("gallery-photo");
const viewer = (page: Page) => page.getByRole("dialog", { name: "Photo agrandie" });
const counter = (page: Page) => page.getByTestId("viewer-counter");
const shownId = async (page: Page) =>
  new URL(page.url()).searchParams.get("photo");

async function swipe(page: Page, dx: number) {
  const box = (await viewer(page).getByRole("img").boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 3 });
  await page.mouse.move(x + dx, y, { steps: 3 });
  await page.mouse.up();
}

/**
 * Scenario: Ouvrir une photo
 *   Given la galerie contient 24 photos
 *   When je touche la 7e
 *   Then elle s'affiche en grand sur fond sombre avec "7 / 24"
 */
test("ouvrir la 7e photo : en grand, sur fond sombre, « 7 / 24 »", async ({ page }) => {
  await openGallery(page, ids(24));

  await tiles(page).nth(6).click();

  await expect(viewer(page)).toBeVisible();
  await expect(counter(page)).toHaveText("7 / 24");
  expect(await shownId(page)).toBe("p7");
  const background = await viewer(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).toBe("rgb(43, 27, 32)");
  await expect(page.getByText("Glissez pour voir les autres photos")).toBeVisible();
  // The grid is not shown under it (SCRUM-64).
  await expect(page.getByTestId("gallery-screen")).toBeHidden();
});

/**
 * Scenario: Photo suivante par balayage
 *   Given la photo 7 / 24 est affichée
 *   When je glisse vers la gauche
 *   Then la photo 8 / 24 est affichée
 */
test("glisser vers la gauche : la photo suivante ; vers la droite : la précédente", async ({
  page,
}) => {
  await openGallery(page, ids(24));
  await tiles(page).nth(6).click();

  await swipe(page, -150);
  await expect(counter(page)).toHaveText("8 / 24");
  expect(await shownId(page)).toBe("p8");

  await swipe(page, 150);
  await expect(counter(page)).toHaveText("7 / 24");
});

test("un mouvement trop court ne change pas de photo", async ({ page }) => {
  await openGallery(page, ids(24));
  await tiles(page).nth(6).click();

  await swipe(page, -20);

  await expect(counter(page)).toHaveText("7 / 24");
});

/**
 * Scenario: Navigation au clavier ou par flèches
 *   Given la photo 7 / 24 est affichée
 *   When j'active "Photo précédente"
 *   Then la photo 6 / 24 est affichée
 */
test("flèches et clavier", async ({ page }) => {
  await openGallery(page, ids(24));
  await tiles(page).nth(6).click();

  await page.getByRole("button", { name: "Photo précédente" }).click();
  await expect(counter(page)).toHaveText("6 / 24");

  await page.getByRole("button", { name: "Photo suivante" }).click();
  await expect(counter(page)).toHaveText("7 / 24");

  await page.keyboard.press("ArrowRight");
  await expect(counter(page)).toHaveText("8 / 24");
  await page.keyboard.press("ArrowLeft");
  await expect(counter(page)).toHaveText("7 / 24");
});

/**
 * Scenario: Bords de la galerie
 *   Given la première photo est affichée
 *   Then le bouton "Photo précédente" n'est pas proposé
 */
test("bords : pas de « précédente » sur la première, pas de « suivante » sur la dernière", async ({
  page,
}) => {
  await openGallery(page, ids(3));

  await tiles(page).first().click();
  await expect(page.getByRole("button", { name: "Photo précédente" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Photo suivante" })).toBeVisible();

  await page.getByRole("button", { name: "Photo suivante" }).click();
  await page.getByRole("button", { name: "Photo suivante" }).click();
  await expect(counter(page)).toHaveText("3 / 3");
  await expect(page.getByRole("button", { name: "Photo suivante" })).toHaveCount(0);
});

test("au bout des photos chargées, « suivante » charge la page d'après", async ({ page }) => {
  await openGallery(page, ids(GALLERY_PAGE_SIZE + 3));
  await tiles(page).last().click();
  await expect(counter(page)).toHaveText(`${GALLERY_PAGE_SIZE} / ${GALLERY_PAGE_SIZE + 3}`);

  await page.getByRole("button", { name: "Photo suivante" }).click();

  await expect(counter(page)).toHaveText(`${GALLERY_PAGE_SIZE + 1} / ${GALLERY_PAGE_SIZE + 3}`);
  expect(await shownId(page)).toBe(`p${GALLERY_PAGE_SIZE + 1}`);
});

/**
 * Scenario: Retour à la grille
 *   Given j'ai ouvert une photo après avoir fait défiler la grille
 *   When je touche "Galerie" ou le retour du téléphone
 *   Then je retrouve la grille à la même position
 */
for (const how of ["Galerie", "retour du téléphone"] as const) {
  test(`retour à la grille par « ${how} », à la même position`, async ({ page }) => {
    await openGallery(page, ids(24));
    await tiles(page).last().scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(200);

    await tiles(page).last().click();
    await expect(viewer(page)).toBeVisible();

    if (how === "Galerie") await viewer(page).getByRole("button", { name: "Galerie" }).click();
    else await page.goBack();

    await expect(viewer(page)).toHaveCount(0);
    await expect(tiles(page).last()).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    expect(await shownId(page)).toBeNull();
  });
}

test("Échap ferme la photo", async ({ page }) => {
  await openGallery(page, ids(3));
  await tiles(page).first().click();

  await page.keyboard.press("Escape");

  await expect(viewer(page)).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(3);
});

test("rechargée avec une photo dans l'adresse, la page montre la grille", async ({ page }) => {
  await openGallery(page, ids(3));
  await page.goto(`${GALLERY}?photo=p2`);

  await expect(tiles(page)).toHaveCount(3);
  await expect(viewer(page)).toHaveCount(0);
  expect(await shownId(page)).toBeNull();
});

/**
 * Scenario: Photo entière
 *   When une photo en paysage est affichée
 *   Then elle est visible en entier, sans recadrage
 */
test("photo entière : jamais recadrée, contenue dans l'écran", async ({ page }) => {
  await openGallery(page, ids(3));
  await tiles(page).first().click();

  const img = viewer(page).getByRole("img", { name: "Photo agrandie" });
  await expect(img).toHaveAttribute("data-full", "true");
  expect(await img.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");
  await expect(img).toBeInViewport({ ratio: 1 });
});

test("petit écran 320 × 568 : compteur, retour et flèches visibles sans défiler", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openGallery(page, ids(5), { mine: ["p3"] });
  await tiles(page).nth(2).click();

  for (const target of [
    viewer(page).getByRole("button", { name: "Galerie" }),
    counter(page),
    page.getByRole("button", { name: "Photo précédente" }),
    page.getByRole("button", { name: "Photo suivante" }),
    page.getByRole("button", { name: "Imprimer", exact: true }),
  ]) {
    await expect(target).toBeInViewport({ ratio: 1 });
  }
});

test("les nouvelles photos ne décalent ni la photo ni le compteur", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-06T14:00:00Z") });
  const { gallery } = await openGallery(page, ids(5));
  await tiles(page).nth(1).click();
  await expect(counter(page)).toHaveText("2 / 5");

  gallery.ids.unshift("nouvelle");
  await page.clock.runFor(30_000);

  await expect(counter(page)).toHaveText("2 / 5");
  expect(await shownId(page)).toBe("p2");
  await page.getByRole("button", { name: "Photo précédente" }).click();
  expect(await shownId(page)).toBe("p1");

  await viewer(page).getByRole("button", { name: "Galerie" }).click();
  await expect(tiles(page)).toHaveCount(6);
});

test("photo supprimée pendant qu'on la regarde : message, puis la suivante", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-06T14:00:00Z") });
  const { gallery } = await openGallery(page, ids(3));
  await tiles(page).nth(1).click();

  gallery.ids.splice(1, 1);
  await page.clock.runFor(10_000);

  await expect(viewer(page).getByText("Cette photo n'est plus disponible.")).toBeVisible();
  await page.clock.runFor(GONE_DELAY_MS + 100);
  expect(await shownId(page)).toBe("p3");
  await expect(counter(page)).toHaveText("2 / 2");
});

/**
 * Scenario: Mes photos dans la même visionneuse
 *   Given la galerie contient ma photo entre deux photos d'autres invités
 *   When j'ouvre la photo précédant la mienne et je glisse vers la gauche
 *   Then ma photo s'affiche dans la même vue, avec la pastille "Vous"
 */
test("ma photo dans la même visionneuse, avec « Vous »", async ({ page }) => {
  await openGallery(page, ["a", "m", "b"], { mine: ["m"] });
  await tiles(page).first().click();
  await expect(viewer(page).getByText("Vous", { exact: true })).toHaveCount(0);

  await swipe(page, -150);

  await expect(counter(page)).toHaveText("2 / 3");
  await expect(viewer(page).getByText("Vous", { exact: true })).toBeVisible();
  await expect(viewer(page).getByRole("img", { name: "Votre photo" })).toBeVisible();
});

/**
 * Scenario: État d'impression en pastille
 *   Given ma photo est en attente de validation par l'équipe
 *   When je l'ouvre en grand
 *   Then je vois la pastille "En attente de validation"
 *   And aucun suivi en étapes n'est affiché
 *   When je touche la pastille
 *   Then la page "Vos tirages" s'ouvre
 */
test("ma photo en attente : une pastille qui ouvre « Vos tirages », pas d'étapes", async ({
  page,
}) => {
  await openGallery(page, ["m"], { mine: ["m"], jobs: [fakeJob("j1", "PENDING", "m")] });
  await tiles(page).first().click();

  const pill = page.getByTestId("viewer-print-state");
  await expect(pill).toHaveText("En attente de validation");
  await expect(page.getByRole("list", { name: "Étapes de l'impression" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toHaveCount(0);

  await pill.click();

  await expect(page.getByRole("heading", { name: "Vos tirages" })).toBeVisible();
  await expect(page).toHaveURL(/\/e\/jeton-de-test$/);
});

/**
 * Scenario: Imprimer depuis la visionneuse
 *   Given ma photo n'a jamais été imprimée
 *   When je l'ouvre en grand
 *   Then je vois le bouton "Imprimer" et l'état de l'imprimante
 */
test("ma photo jamais imprimée : « Imprimer », l'état de l'imprimante, puis la pastille", async ({
  page,
}) => {
  const { album } = await openGallery(page, ["m"], { mine: ["m"] });
  await tiles(page).first().click();
  await expect(page.getByTestId("printer-status")).toBeVisible();

  const print = page.getByRole("button", { name: "Imprimer", exact: true });
  await print.dblclick();

  await expect(page.getByTestId("viewer-print-state")).toHaveText("En attente de validation");
  await expect(print).toHaveCount(0);
  expect(album.created).toHaveLength(1);
  expect(album.created[0].p_photo_id).toBe("m");
});

/**
 * Scenario: Pas d'impression pour les photos des autres
 *   When j'ouvre la photo d'un autre invité
 *   Then aucun bouton "Imprimer" ni état d'impression n'est affiché
 */
test("photo d'un autre invité : ni « Imprimer » ni état d'impression", async ({ page }) => {
  await openGallery(page, ["a", "m"], { mine: ["m"] });
  await tiles(page).first().click();
  await expect(viewer(page).getByRole("img", { name: "Photo agrandie" })).toBeVisible();

  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("printer-status")).toHaveCount(0);
  await expect(page.getByTestId("viewer-print-state")).toHaveCount(0);
});

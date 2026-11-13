import { test, expect, Page } from "@playwright/test";
import { mockGuestBackend, mockPhotoBackend } from "./support/guest-mocks";
import { mockGallery } from "./support/gallery-mocks";
import { json } from "./support/guest-mocks";
import { stripes } from "./support/images";

// SCRUM-65 — What the guest sees on the phone is what will be printed: the
// frame of the camera in 4:5, the preview as the Polaroid page.

const HOME = "/e/jeton-de-test";

test.use({
  viewport: { width: 390, height: 844 },
  // Chrome's fake camera: the real capture code runs on a real video stream.
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

const ratioOf = async (page: Page, testId: string) => {
  const box = (await page.getByTestId(testId).boundingBox())!;
  return box.width / box.height;
};

async function openCamera(page: Page) {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  const calls = await mockPhotoBackend(page);
  await page.goto(HOME);
  await page.getByRole("button", { name: "Prendre une photo" }).click();
  await expect
    .poll(() => page.getByLabel("Aperçu de la caméra").evaluate((v: HTMLVideoElement) => v.videoWidth))
    .toBeGreaterThan(0);
  return calls;
}

/**
 * Scenario: Viseur vertical aux proportions du tirage
 *   Given j'ouvre la caméra, téléphone tenu droit ou couché
 *   Then le viseur montre un cadre vertical en 4:5, l'extérieur assombri
 */
for (const [held, viewport] of [
  ["droit", { width: 390, height: 844 }],
  ["couché", { width: 844, height: 390 }],
] as const) {
  test(`téléphone tenu ${held} : un viseur vertical en 4:5`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openCamera(page);

    expect(await ratioOf(page, "camera-frame")).toBeCloseTo(0.8, 2);
    // The rest of the screen stays dark.
    const background = await page.locator("main").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).toBe("rgb(0, 0, 0)");
    await expect(page.getByText("Ce qui est dans le cadre sera imprimé")).toBeVisible();
  });
}

/**
 * Scenario: Photo prise, aperçu fidèle
 *   Given je prends une photo avec la caméra de l'application
 *   When l'aperçu s'affiche
 *   Then je vois exactement la zone du viseur, dans le cadre Polaroid
 */
test("photo prise : la zone du viseur, dans le cadre Polaroid", async ({ page }) => {
  const calls = await openCamera(page);

  await page.getByRole("button", { name: "Prendre la photo" }).click();

  const photo = page.getByTestId("print-photo");
  await expect(photo).toBeVisible();
  // The photo itself is the viewfinder's zone: 4:5.
  const natural = await photo.evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight);
  expect(natural).toBeCloseTo(0.8, 2);
  // On a white page in 2:3 (4 × 6 inches), in a 4:5 window.
  expect(await ratioOf(page, "print-page")).toBeCloseTo(2 / 3, 2);
  expect(await ratioOf(page, "print-photo")).toBeCloseTo(0.8, 2);

  await page.getByRole("button", { name: "Valider sans imprimer" }).click();
  await expect(page.getByRole("button", { name: "Prendre une autre photo" })).toBeVisible();
  // All of a 4:5 photo is kept.
  const sent = calls.registers[0];
  expect(Number(sent.p_width) / Number(sent.p_height)).toBeCloseTo(0.8, 2);
  expect(sent).toMatchObject({ p_crop_x: 0, p_crop_y: 0, p_crop_w: 1, p_crop_h: 1 });
});

/**
 * Scenario: Photo importée recadrée au centre
 *   Given j'importe une photo en 4:3 en paysage
 *   When l'aperçu s'affiche
 *   Then je vois sa partie centrale en 4:5 vertical, sans bandes blanches dans la photo
 */
test("photo importée en paysage : sa partie centrale en 4:5", async ({ page }) => {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  const calls = await mockPhotoBackend(page);
  await page.goto(HOME);
  await page.getByRole("button", { name: "Importer une photo" }).waitFor();
  const landscape = await stripes(800, 600, [[220, 30, 30], [30, 180, 60], [30, 60, 220]]);
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "paysage.png", mimeType: "image/png", buffer: landscape });

  const photo = page.getByTestId("print-photo");
  await expect(photo).toBeVisible();
  expect(await ratioOf(page, "print-photo")).toBeCloseTo(0.8, 2);
  // The whole photo is cut to the window from its centre, never letterboxed.
  expect(await photo.evaluate((img) => getComputedStyle(img).objectFit)).toBe("cover");
  expect(await photo.evaluate((img) => getComputedStyle(img).objectPosition)).toBe("50% 50%");

  await page.getByRole("button", { name: "Valider sans imprimer" }).click();
  await expect(page.getByRole("button", { name: "Prendre une autre photo" })).toBeVisible();
  const sent = calls.registers[0];
  expect([sent.p_width, sent.p_height]).toEqual([800, 600]);
  expect(sent.p_crop_x).toBeCloseTo(0.2);
  expect(sent.p_crop_w).toBeCloseTo(0.6);
  expect(sent).toMatchObject({ p_crop_y: 0, p_crop_h: 1 });
});

test("petit écran 320 × 568 : aperçu et actions sans défiler", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  await mockPhotoBackend(page);
  await page.goto(HOME);
  await page.getByRole("button", { name: "Importer une photo" }).waitFor();
  await page.getByLabel("Choisir une photo").setInputFiles({
    name: "p.png",
    mimeType: "image/png",
    buffer: await stripes(600, 800, [[200, 120, 90]]),
  });

  await expect(page.getByTestId("print-page")).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeInViewport({ ratio: 1 });
});

/**
 * Scenario: Galerie inchangée
 *   Given ma photo est partagée dans la galerie
 *   When je l'ouvre en grand
 *   Then elle est entière, sans cadre
 */
test("galerie : ma photo en grand reste entière, sans cadre", async ({ page }) => {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  await page.route("**/rest/v1/print_jobs?**", (route) => json(route, []));
  await mockGallery(page, ["m"], { mine: ["m"] });
  await page.goto(`${HOME}/galerie`);
  await page.getByTestId("gallery-photo").first().click();

  const viewer = page.getByRole("dialog", { name: "Photo agrandie" });
  await expect(viewer.getByRole("img")).toBeVisible();
  expect(await viewer.getByRole("img").evaluate((img) => getComputedStyle(img).objectFit)).toBe("contain");
  await expect(viewer.getByTestId("print-page")).toHaveCount(0);
});

// SCRUM-66 — A bigger print, and a "Votre photo" screen that leaves it the room.

async function openReview(page: Page, galleryVisible = true) {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: galleryVisible } });
  await mockPhotoBackend(page);
  await page.goto(HOME);
  await page.getByRole("button", { name: "Importer une photo" }).waitFor();
  await page.getByLabel("Choisir une photo").setInputFiles({
    name: "p.png",
    mimeType: "image/png",
    buffer: await stripes(800, 1000, [[200, 120, 90], [40, 90, 160]]),
  });
  await expect(page.getByTestId("print-photo")).toBeVisible();
  // The screen's entrance animation moves and scales it: measure after.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
}

/**
 * Scenario: Aperçu aux mêmes proportions
 *   Given je prends une photo
 *   When l'écran « Votre photo » s'affiche
 *   Then le tirage montré respecte ces dimensions
 */
test("aperçu : photo de 88 × 110 mm sur la page, mêmes bords en haut et sur les côtés", async ({ page }) => {
  await openReview(page);
  const sheet = (await page.getByTestId("print-page").boundingBox())!;
  const photo = (await page.getByTestId("print-photo").boundingBox())!;
  expect(photo.width / sheet.width).toBeCloseTo(88 / 101.6, 2);
  expect(photo.height / sheet.height).toBeCloseTo(110 / 152.4, 2);
  const left = photo.x - sheet.x;
  const top = photo.y - sheet.y;
  const right = sheet.x + sheet.width - photo.x - photo.width;
  expect(Math.abs(left - top)).toBeLessThan(1.5);
  expect(Math.abs(right - top)).toBeLessThan(1.5);
});

/**
 * Scenario: Écran épuré
 *   Given l'écran « Votre photo » sur un iPhone (390 × 844)
 *   Then le statut de l'imprimante est visible dans l'en-tête
 *   And « Valider sans imprimer » est un lien texte
 *   And l'interrupteur de la galerie tient sur une ligne
 *   And le tirage est plus haut qu'avant
 */
test("écran épuré : statut dans l'en-tête, lien texte, interrupteur sur une ligne, grand tirage", async ({
  page,
}) => {
  await openReview(page);

  await expect(page.locator("header").getByTestId("printer-status")).toHaveText(
    "L'imprimante est connectée"
  );
  await expect(page.getByRole("heading", { name: "Votre photo" })).toHaveCount(0);

  const print = (await page.getByRole("button", { name: "Imprimer", exact: true }).boundingBox())!;
  const validate = page.getByRole("button", { name: "Valider sans imprimer" });
  expect(await validate.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe("underline");
  expect((await validate.boundingBox())!.height).toBeLessThan(print.height);

  const toggle = page.getByText("Ajouter à la galerie", { exact: true });
  const line = parseFloat(await toggle.evaluate((el) => getComputedStyle(el).lineHeight));
  expect((await toggle.boundingBox())!.height).toBeLessThanOrEqual(line + 1);
  await expect(page.getByText("Les autres invités pourront la voir")).toHaveCount(0);

  // Before SCRUM-66 the page was about 450 px high on this phone; SCRUM-61
  // gave one row back to the guest's text.
  expect((await page.getByTestId("print-page").boundingBox())!.height).toBeGreaterThan(480);
});

test("imprimante hors ligne : le message entier reste lisible dans l'en-tête, sans déborder", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  await mockPhotoBackend(page, { printerOnline: false });
  await page.goto(HOME);
  await page.getByRole("button", { name: "Importer une photo" }).waitFor();
  await page.getByLabel("Choisir une photo").setInputFiles({
    name: "p.png",
    mimeType: "image/png",
    buffer: await stripes(800, 1000, [[200, 120, 90]]),
  });

  const status = page.locator("header").getByTestId("printer-status");
  await expect(status).toHaveText("L'imprimante n'est pas connectée pour le moment");
  await expect(status).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Reprendre" })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

/**
 * Scenario: Aide de la galerie
 *   When j'active « Ajouter à la galerie »
 *   Then une courte explication s'affiche puis disparaît
 */
test("aide de la galerie : affichée à l'activation, puis elle s'efface", async ({ page }) => {
  await openReview(page);
  const toggle = page.getByRole("checkbox", { name: "Ajouter à la galerie" });
  const hint = page.getByTestId("gallery-hint");

  await toggle.uncheck();
  await expect(hint).toHaveCount(0);
  await toggle.check();
  await expect(hint).toHaveText("Les autres invités pourront la voir et l'enregistrer.");
  await expect(hint).toHaveCount(0, { timeout: 6000 });
});

test("aide de la galerie pas encore ouverte : le bon message", async ({ page }) => {
  await openReview(page, false);
  const toggle = page.getByRole("checkbox", { name: "Ajouter à la galerie" });
  await toggle.uncheck();
  await toggle.check();
  await expect(page.getByTestId("gallery-hint")).toHaveText(
    "Elle sera visible, et enregistrable, à l'ouverture de la galerie."
  );
});

/**
 * Scenario: Voir le tirage en plein écran
 *   When je touche le tirage
 *   Then il s'affiche en plein écran et je peux zoomer
 *   When je ferme ou j'appuie sur retour
 *   Then je reviens à « Votre photo » sans perdre mes choix
 */
test("plein écran : toucher le tirage, zoomer, revenir avec le bouton retour", async ({ page }) => {
  await openReview(page);
  await page.getByRole("checkbox", { name: "Ajouter à la galerie" }).uncheck();

  await page.getByRole("button", { name: "Voir le tirage en grand" }).click();
  const zoom = page.getByRole("dialog", { name: "Tirage en grand" });
  await expect(zoom).toBeVisible();
  // The whole width of the phone, nothing else on screen.
  const big = (await zoom.getByTestId("print-page").boundingBox())!;
  expect(big.width).toBeGreaterThan(0.9 * page.viewportSize()!.width);

  // A double tap zooms in, another zooms back.
  const scale = zoom.getByTestId("print-zoom");
  await zoom.getByTestId("print-zoom-area").dblclick();
  await expect(scale).toHaveAttribute("data-scale", "2.50");
  await zoom.getByTestId("print-zoom-area").dblclick();
  await expect(scale).toHaveAttribute("data-scale", "1.00");

  // Two fingers moving apart.
  const area = zoom.getByTestId("print-zoom-area");
  const fire = (type: string, pointerId: number, x: number) =>
    area.dispatchEvent(type, { pointerId, clientX: x, clientY: 400, isPrimary: pointerId === 1, bubbles: true });
  await fire("pointerdown", 1, 150);
  await fire("pointerdown", 2, 250);
  await fire("pointermove", 2, 350);
  await fire("pointerup", 2, 350);
  await fire("pointerup", 1, 150);
  await expect(scale).toHaveAttribute("data-scale", "2.00");

  // The phone's back button: back to "Votre photo", choices kept.
  await page.goBack();
  await expect(zoom).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Ajouter à la galerie" })).not.toBeChecked();
});

test("plein écran : la croix ferme, et le retour suivant quitte bien l'aperçu", async ({ page }) => {
  await openReview(page);
  await page.getByRole("button", { name: "Voir le tirage en grand" }).click();
  const zoom = page.getByRole("dialog", { name: "Tirage en grand" });
  await zoom.getByRole("button", { name: "Fermer" }).click();
  await expect(zoom).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeVisible();

  // Escape too, on a computer.
  await page.getByRole("button", { name: "Voir le tirage en grand" }).click();
  await page.keyboard.press("Escape");
  await expect(zoom).toHaveCount(0);
});

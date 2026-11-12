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

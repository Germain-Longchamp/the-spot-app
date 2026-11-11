import { crc32, deflateSync } from "node:zlib";
import { test, expect, Locator, Page } from "@playwright/test";
import { json, mockGuestBackend, mockPhotoBackend, TEST_EVENT } from "./support/guest-mocks";

/** The photo files sent, without the gallery thumbnails (shared by default, SCRUM-63). */
const photoFiles = <T extends { path: string }>(uploads: T[]) =>
  uploads.filter((upload) => !upload.path.endsWith("-thumb.jpg"));


const URL = "/e/jeton-de-test";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

/** A tall photo (600 x 1200), as taken with a phone held upright. */
const PORTRAIT = (() => {
  const [w, h] = [600, 1200];
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x88)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
})();

test.use({ viewport: { width: 390, height: 844 } });

async function openHome(
  page: Page,
  event: Partial<typeof TEST_EVENT> = {},
  photoBackend: Parameters<typeof mockPhotoBackend>[1] = {}
) {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true, ...event } });
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  const backend = await mockPhotoBackend(page, photoBackend);
  // The tracking follows the request created in this test.
  await page.route("**/rest/v1/print_jobs?**", (route) =>
    json(
      route,
      backend.registers.length
        ? [
            {
              id: "job-1",
              photo_id: backend.registers[0].p_photo_id,
              status: "PENDING",
              created_at: new Date().toISOString(),
            },
          ]
        : []
    )
  );
  await page.goto(URL);
  await expect(page.getByRole("button", { name: "Prendre une photo" })).toBeVisible();
  return backend;
}

async function openReview(
  page: Page,
  event: Partial<typeof TEST_EVENT> = {},
  image: Buffer = PNG,
  photoBackend: Parameters<typeof mockPhotoBackend>[1] = {}
) {
  const backend = await openHome(page, event, photoBackend);
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: image });
  await expect(page.getByRole("img", { name: "Votre photo" })).toBeVisible();
  return backend;
}

/** Fully inside the viewport, without scrolling. */
async function inView(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const { height, width } = page.viewportSize()!;
  expect(box, "élément absent").not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
}

/**
 * Scenario: Accueil clair
 *   Then je vois le logo couleur, le nom de l'événement
 *   And deux grandes actions de même poids
 */
test("accueil : logo couleur, nom, deux grandes actions de même poids", async ({ page }) => {
  await openHome(page);

  await expect(page.getByRole("img", { name: "The Spot Memories" })).toHaveAttribute(
    "src",
    /couleur/
  );
  await expect(page.getByRole("heading", { name: TEST_EVENT.name })).toBeVisible();

  const take = page.getByRole("button", { name: "Prendre une photo" });
  const load = page.getByRole("button", { name: "Importer une photo" });
  const [a, b] = [await take.boundingBox(), await load.boundingBox()];
  expect(a!.height).toBeGreaterThanOrEqual(120);
  expect(Math.abs(a!.width - b!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(a!.height - b!.height)).toBeLessThanOrEqual(1);
  await inView(page, take);
  await inView(page, load);
  await expect(page.getByRole("list", { name: "Comment ça marche" })).toBeVisible();
});

/**
 * Scenario: Aperçu
 *   Then je vois ma photo, l'interrupteur "Ajouter à la galerie"
 *   And les actions "Imprimer" et "Valider sans imprimer" restent visibles en bas
 *   And "Reprendre" est visible en haut
 */
test("aperçu : actions fixées en bas, « Reprendre » en haut, même après défilement", async ({
  page,
}) => {
  await openReview(page);

  // Shared by default since SCRUM-63.
  await expect(page.getByRole("checkbox", { name: "Ajouter à la galerie" })).toBeChecked();
  const print = page.getByRole("button", { name: "Imprimer", exact: true });
  const validate = page.getByRole("button", { name: "Valider sans imprimer" });
  const back = page.getByRole("button", { name: "Reprendre" });

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await inView(page, print);
  await inView(page, validate);
  await inView(page, back);
  expect((await print.boundingBox())!.y).toBeGreaterThan(page.viewportSize()!.height / 2);
  expect((await back.boundingBox())!.y).toBeLessThan(80);
  await expect(page.getByTestId("printer-status")).toBeVisible();
});

test("l'interrupteur de galerie se décoche au toucher et reste une case à cocher", async ({
  page,
}) => {
  await openReview(page);

  await page.getByText("Ajouter à la galerie de l'événement").click();

  // Ticked by default (SCRUM-63): one touch unticks it.
  await expect(page.getByRole("checkbox", { name: "Ajouter à la galerie" })).not.toBeChecked();
});

/**
 * Scenario: Envoi
 *   When j'appuie sur "Imprimer"
 *   Then un écran d'envoi montre la progression
 */
test("envoi : un écran dédié montre la progression", async ({ page }) => {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  await page.route("**/rest/v1/print_jobs?**", (route) => json(route, []));
  await mockPhotoBackend(page, { uploadDelayMs: 1500 });
  await page.goto(URL);
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });

  await page.getByRole("button", { name: "Imprimer", exact: true }).click();

  await expect(page.getByRole("progressbar", { name: "Progression de l'envoi" })).toBeAttached();
  await expect(page.getByRole("status")).toContainText("Envoi de votre photo");
  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toHaveCount(0);
});

/**
 * Scenario: Fin du parcours
 *   Then j'arrive sur un écran de confirmation
 *   And je suis l'avancement de mon impression en étapes, avec l'état de l'imprimante
 *   And les boutons "Prendre une autre photo" et "Retour à l'accueil" sont visibles sans défilement
 */
test("fin du parcours : confirmation, suivi en étapes, sorties visibles", async ({ page }) => {
  await openReview(page);

  await page.getByRole("button", { name: "Imprimer", exact: true }).click();

  await expect(page.getByRole("heading", { name: "C'est parti pour l'impression !" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Étapes de l'impression" })).toBeVisible();
  await expect(page.getByTestId("my-prints")).toContainText("En attente de validation par l'équipe");
  await expect(page.getByTestId("printer-status")).toBeVisible();
  await inView(page, page.getByRole("button", { name: "Prendre une autre photo" }));
  await inView(page, page.getByRole("button", { name: "Retour à l'accueil" }));
  await expect(page.locator("body")).not.toContainText(/PENDING|PRINTING|STUCK/);
});

test("« Retour à l'accueil » ramène à l'accueil", async ({ page }) => {
  await openReview(page);
  await page.getByRole("button", { name: "Imprimer", exact: true }).click();

  await page.getByRole("button", { name: "Retour à l'accueil" }).click();

  await expect(page.getByRole("button", { name: "Importer une photo" })).toBeVisible();
});

test("« Prendre une autre photo » ouvre directement la caméra", async ({ page }) => {
  await openReview(page);
  await page.getByRole("button", { name: "Imprimer", exact: true }).click();

  await page.getByRole("button", { name: "Prendre une autre photo" }).click();

  // Headless browsers have no camera: the camera screen answers with its
  // fallback, which proves we left the confirmation for the camera.
  await expect(
    page.getByRole("button", { name: "Prendre la photo" }).or(page.getByRole("heading", { name: "Caméra indisponible" }))
  ).toBeVisible();
});

/**
 * SCRUM-63: the confirmation leads to the gallery, where the guest's photos are.
 */
test("la confirmation mène à la galerie", async ({ page }) => {
  await openReview(page);
  await page.route("**/rest/v1/gallery_photos?**", (route) => json(route, []));
  await page.getByRole("button", { name: "Imprimer", exact: true }).click();

  await page.getByRole("link", { name: "Voir la galerie" }).click();

  await expect(page).toHaveURL(/\/galerie$/);
  await expect(page.getByRole("heading", { name: "Galerie de l'événement" })).toBeVisible();
});

test("valider sans imprimer, puis imprimer depuis la confirmation", async ({ page }) => {
  const backend = await openReview(page);

  await page.getByRole("button", { name: "Valider sans imprimer" }).click();
  await expect(page.getByRole("heading", { name: "Photo enregistrée" })).toBeVisible();

  await page.getByRole("button", { name: "Imprimer", exact: true }).click();

  await expect(page.getByRole("heading", { name: "C'est parti pour l'impression !" })).toBeVisible();
  expect(photoFiles(backend.uploads)).toHaveLength(1);
  expect(backend.prints).toHaveLength(1);
});

test("échec d'envoi : retour à l'aperçu, photo conservée, message et nouvel essai", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  await mockPhotoBackend(page, { uploadFailures: 5 });
  await page.goto(URL);
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });

  await page.getByRole("button", { name: "Imprimer", exact: true }).click();

  await expect(page.getByRole("alert").filter({ hasText: "n'a pas pu être envoyée" })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByRole("img", { name: "Votre photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeEnabled();
});

/**
 * Scenario: Moins d'animations
 *   Given mon téléphone demande de réduire les animations
 *   Then aucune animation de transition n'est jouée
 */
test("réglage « réduire les animations » : aucune animation ni transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openReview(page);

  const timings = await page.evaluate(() =>
    Array.from(document.querySelectorAll("main, main *, button")).map((element) => {
      const style = getComputedStyle(element);
      return [style.animationDuration, style.transitionDuration];
    })
  );
  const seconds = (value: string) =>
    Math.max(...value.split(",").map((part) => parseFloat(part) * (part.trim().endsWith("ms") ? 0.001 : 1)));
  for (const [animation, transition] of timings) {
    expect(seconds(animation)).toBeLessThanOrEqual(0.001);
    expect(seconds(transition)).toBeLessThanOrEqual(0.001);
  }
});

test("sans réglage particulier, les écrans arrivent en douceur", async ({ page }) => {
  await openHome(page);

  const name = await page.locator("main").first().evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toContain("screen-in");
});

/**
 * SCRUM-52 — Scenario: Tout est visible sur un petit téléphone
 *   Given un téléphone de 320 x 568 et une photo en portrait
 *   When j'arrive sur "Votre photo"
 *   Then je vois sans faire défiler l'état de l'imprimante, l'interrupteur
 *   "Ajouter à la galerie", "Imprimer" et "Valider sans imprimer"
 * Scenario: Photo entière
 *   Then la photo est affichée en entier, sans recadrage
 */
for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]) {
  test(`${viewport.width} x ${viewport.height} : tout ce qui sert à décider est visible sans défiler`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openReview(page, {}, PORTRAIT);

    const photo = page.getByRole("img", { name: "Votre photo" });
    for (const locator of [
      page.getByRole("button", { name: "Reprendre" }),
      photo,
      page.getByTestId("printer-status"),
      page.getByText("Ajouter à la galerie de l'événement"),
      page.getByRole("checkbox", { name: "Ajouter à la galerie" }),
      page.getByRole("button", { name: "Imprimer", exact: true }),
      page.getByRole("button", { name: "Valider sans imprimer" }),
    ]) {
      await inView(page, locator);
    }

    const scrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1
    );
    expect(scrolls).toBe(false);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);

    // Whole photo: shown at its own proportions, never cropped.
    expect(await photo.evaluate((img) => getComputedStyle(img).objectFit)).toBe("contain");
    const box = (await photo.boundingBox())!;
    expect(box.height).toBeGreaterThan(80);
  });
}

/**
 * SCRUM-52 — Scenario: Imprimante déconnectée
 *   Then le message "L'imprimante n'est pas connectée pour le moment" est
 *   visible au-dessus de "Imprimer"
 */
test("imprimante déconnectée : le message est au-dessus de « Imprimer »", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openReview(page, {}, PNG, { printerOnline: false });

  const status = page.getByText("L'imprimante n'est pas connectée pour le moment");
  const print = page.getByRole("button", { name: "Imprimer", exact: true });
  await expect(status).toBeVisible();
  await inView(page, status);
  expect((await status.boundingBox())!.y).toBeLessThan((await print.boundingBox())!.y);
});

/**
 * SCRUM-52 — Scenario: Impression indisponible
 *   Given les impressions sont en pause
 *   Then le motif est visible au-dessus de "Imprimer", qui est désactivé
 */
test("impressions en pause : motif visible au-dessus de « Imprimer », désactivé", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openReview(page, {}, PNG, { availability: "paused" });

  const print = page.getByRole("button", { name: "Imprimer", exact: true });
  const reason = page.getByRole("status").filter({ hasText: /pause/i });
  await expect(print).toBeDisabled();
  await inView(page, reason);
  expect((await reason.boundingBox())!.y).toBeLessThan((await print.boundingBox())!.y);
});

/**
 * SCRUM-52 — Scenario: Galerie désactivée
 *   Then aucun interrupteur galerie n'est affiché
 */
test("galerie désactivée : pas d'interrupteur", async ({ page }) => {
  await openReview(page, { gallery_enabled: false, gallery_visible: false });

  await expect(page.getByRole("checkbox", { name: "Ajouter à la galerie" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeVisible();
});
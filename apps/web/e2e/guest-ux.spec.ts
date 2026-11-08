import { test, expect, Locator, Page } from "@playwright/test";
import { json, mockGuestBackend, mockPhotoBackend, TEST_EVENT } from "./support/guest-mocks";

const URL = "/e/jeton-de-test";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test.use({ viewport: { width: 390, height: 844 } });

async function openHome(page: Page, event: Partial<typeof TEST_EVENT> = {}) {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true, ...event } });
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  const backend = await mockPhotoBackend(page);
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

async function openReview(page: Page, event: Partial<typeof TEST_EVENT> = {}) {
  const backend = await openHome(page, event);
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
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

  await expect(page.getByRole("checkbox", { name: "Ajouter à la galerie" })).not.toBeChecked();
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

test("l'interrupteur de galerie se coche au toucher et reste une case à cocher", async ({
  page,
}) => {
  await openReview(page);

  await page.getByText("Ajouter à la galerie de l'événement").click();

  await expect(page.getByRole("checkbox", { name: "Ajouter à la galerie" })).toBeChecked();
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

test("la confirmation mène à « Mes photos »", async ({ page }) => {
  await openReview(page);
  await page.getByRole("button", { name: "Imprimer", exact: true }).click();

  await page.getByRole("button", { name: "Voir mes photos" }).click();

  await expect(page.getByRole("heading", { name: "Mes photos" })).toBeVisible();
});

test("valider sans imprimer, puis imprimer depuis la confirmation", async ({ page }) => {
  const backend = await openReview(page);

  await page.getByRole("button", { name: "Valider sans imprimer" }).click();
  await expect(page.getByRole("heading", { name: "Photo enregistrée" })).toBeVisible();

  await page.getByRole("button", { name: "Imprimer", exact: true }).click();

  await expect(page.getByRole("heading", { name: "C'est parti pour l'impression !" })).toBeVisible();
  expect(backend.uploads).toHaveLength(1);
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

test("petit écran 320 x 568 : la barre du bas ne masque ni la photo ni les retours", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openReview(page);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await inView(page, page.getByRole("button", { name: "Reprendre" }));
  await inView(page, page.getByRole("button", { name: "Imprimer", exact: true }));

  // Scrolled to the end, the content ends above the action bar.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect
    .poll(() => page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1))
    .toBe(true);
  const bar = await page.getByRole("button", { name: "Imprimer", exact: true }).boundingBox();
  const lastContent = await page.getByText("Ajouter à la galerie de l'événement").boundingBox();
  expect(lastContent!.y + lastContent!.height).toBeLessThanOrEqual(bar!.y);
});

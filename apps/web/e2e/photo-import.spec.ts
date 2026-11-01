import { test, expect, Page } from "@playwright/test";
import { mockGuestBackend } from "./support/guest-mocks";

const URL = "/e/jeton-de-test";

// The smallest valid PNG: one pixel.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function open(page: Page) {
  await mockGuestBackend(page);
  await page.goto(URL);
  await expect(
    page.getByRole("button", { name: "Importer une photo" })
  ).toBeVisible();
}

const choose = (page: Page, name: string, mimeType: string, buffer: Buffer) =>
  page.getByLabel("Choisir une photo").setInputFiles({ name, mimeType, buffer });

test("le bouton ouvre le sélecteur de photos", async ({ page }) => {
  await open(page);

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Importer une photo" }).click(),
  ]);

  expect(chooser.isMultiple()).toBe(false);
});

/**
 * Scenario: Import d'une photo valide
 *   When je choisis "Importer une photo" et je sélectionne une image
 *   Then la photo s'affiche sur la prévisualisation avec la bonne orientation
 */
test("une photo valide arrive sur la prévisualisation", async ({ page }) => {
  await open(page);

  await choose(page, "photo.png", "image/png", PNG);

  const photo = page.getByRole("img", { name: "Votre photo" });
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBe(1);
});

/**
 * Scenario: Fichier non image
 *   When je sélectionne un fichier qui n'est pas une image
 *   Then il est refusé avec un message simple
 */
test("un fichier qui n'est pas une image est refusé", async ({ page }) => {
  await open(page);

  await choose(page, "note.pdf", "application/pdf", Buffer.from("%PDF"));

  await expect(page.getByRole("alert").filter({ hasText: "photo" })).toHaveText(
    "Ce fichier n'est pas une photo. Choisissez une image."
  );
});

/** Cas limite : fichier corrompu ou illisible. */
test("une image illisible est refusée", async ({ page }) => {
  await open(page);

  await choose(page, "cassee.jpg", "image/jpeg", Buffer.from("pas une image"));

  await expect(
    page.getByRole("alert").filter({ hasText: "lire cette photo" })
  ).toBeVisible();
});

/** Cas limite : photo très volumineuse, refus avec message explicite. */
test("une photo trop lourde est refusée", async ({ page }) => {
  await open(page);

  await choose(
    page,
    "enorme.jpg",
    "image/jpeg",
    Buffer.alloc(26 * 1024 * 1024)
  );

  await expect(
    page.getByRole("alert").filter({ hasText: "trop lourde" })
  ).toBeVisible();
});

test("une image HEIC illisible n'affiche pas d'erreur technique", async ({
  page,
}) => {
  await open(page);

  await choose(page, "iphone.heic", "image/heic", Buffer.from("pas du heic"));

  await expect(
    page.getByRole("alert").filter({ hasText: "lire cette photo" })
  ).toBeVisible({ timeout: 15_000 });
});

/**
 * Scenario: Annulation
 *   When je ferme le sélecteur sans choisir de fichier
 *   Then je reste sur l'accueil sans erreur
 */
test("fermer le sélecteur laisse sur l'accueil", async ({ page }) => {
  await open(page);

  await page.getByLabel("Choisir une photo").setInputFiles([]);

  await expect(
    page.getByRole("button", { name: "Prendre une photo" })
  ).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "photo" })).toHaveCount(
    0
  );
});

test("une erreur disparaît au nouvel essai", async ({ page }) => {
  await open(page);
  await choose(page, "note.pdf", "application/pdf", Buffer.from("%PDF"));
  await expect(page.getByRole("alert").filter({ hasText: "photo" })).toBeVisible();

  await choose(page, "photo.png", "image/png", PNG);

  await expect(page.getByRole("img", { name: "Votre photo" })).toBeVisible();
});

test("depuis la caméra refusée, l'import ouvre le sélecteur", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("refus", "NotAllowedError"));
  });
  await open(page);
  await page.getByRole("button", { name: "Prendre une photo" }).click();

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Importer une photo" }).click(),
  ]);

  expect(chooser).toBeTruthy();
});

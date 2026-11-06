import { test, expect, Page } from "@playwright/test";
import { mockGuestBackend, mockPhotoBackend, TEST_EVENT } from "./support/guest-mocks";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function openPreview(page: Page, event: Partial<typeof TEST_EVENT>) {
  await mockGuestBackend(page, { event });
  const calls = await mockPhotoBackend(page);
  await page.goto("/e/jeton-de-test");
  await page.getByRole("button", { name: "Importer une photo" }).waitFor();
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Votre photo" })).toBeVisible();
  return calls;
}

const checkbox = (page: Page) =>
  page.getByRole("checkbox", { name: "Ajouter à la galerie" });

test("galerie pas encore ouverte : l'option est proposée et l'invité est prévenu", async ({
  page,
}) => {
  const calls = await openPreview(page, { gallery_enabled: true, gallery_visible: false });

  await checkbox(page).check();
  await page.getByRole("button", { name: "Valider sans imprimer" }).click();

  await expect(page.getByText("apparaîtra dans la galerie dès son ouverture")).toBeVisible();
  expect(calls.registers[0].p_published).toBe(true);
});

test("galerie ouverte : la photo est ajoutée à la galerie", async ({ page }) => {
  const calls = await openPreview(page, { gallery_enabled: true, gallery_visible: true });

  await checkbox(page).check();
  await page.getByRole("button", { name: "Valider sans imprimer" }).click();

  await expect(page.getByText("ajoutée à la galerie")).toBeVisible();
  expect(calls.registers[0].p_published).toBe(true);
});

test("événement sans galerie : pas d'option, rien n'est publié", async ({ page }) => {
  const calls = await openPreview(page, { gallery_enabled: false, gallery_visible: false });

  await expect(checkbox(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Valider sans imprimer" }).click();

  await expect(page.getByText("Votre photo est bien envoyée.")).toBeVisible();
  expect(calls.registers[0].p_published).toBe(false);
});

test("échec réseau : la photo reste non publiée et l'invité peut réessayer", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  const calls = await mockPhotoBackend(page, { uploadFailures: 5 });
  await page.goto("/e/jeton-de-test");
  await page.getByRole("button", { name: "Importer une photo" }).waitFor();
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await checkbox(page).check();
  await page.getByRole("button", { name: "Valider sans imprimer" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "n'a pas pu être envoyée" })
  ).toBeVisible({ timeout: 25_000 });
  // Nothing recorded, so nothing published.
  expect(calls.registers).toEqual([]);

  await page.getByRole("button", { name: "Réessayer sans imprimer" }).click();
  await expect(page.getByText("ajoutée à la galerie")).toBeVisible();
  expect(calls.registers).toHaveLength(1);
  expect(calls.registers[0].p_published).toBe(true);
});

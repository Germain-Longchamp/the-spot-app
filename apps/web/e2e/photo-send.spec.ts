import { test, expect, Page } from "@playwright/test";
import { targetSize } from "../lib/guest/photo-size";
import {
  GUEST_ID,
  mockGuestBackend,
  mockPhotoBackend,
  TEST_EVENT,
} from "./support/guest-mocks";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function openPreview(
  page: Page,
  backend: Parameters<typeof mockPhotoBackend>[1] = {},
  event: Partial<typeof TEST_EVENT> = {
    gallery_visible: true,
  }
) {
  await mockGuestBackend(page, { event });
  const calls = await mockPhotoBackend(page, backend);
  await page.goto("/e/jeton-de-test");
  await page.getByRole("button", { name: "Importer une photo" }).waitFor();
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Votre photo" })).toBeVisible();
  return calls;
}

const print = (page: Page) =>
  page.getByRole("button", { name: "Imprimer", exact: true });
const validate = (page: Page) =>
  page.getByRole("button", { name: "Valider sans imprimer" });

test.describe("prévisualisation", () => {
  /**
   * Scenario: Aperçu et validation
   *   Then je vois ma photo et les actions disponibles
   */
  test("la photo et les actions sont visibles", async ({ page }) => {
    await openPreview(page);

    await expect(print(page)).toBeEnabled();
    await expect(validate(page)).toBeEnabled();
    await expect(page.getByRole("button", { name: "Reprendre" })).toBeVisible();
    await expect(page.getByTestId("printer-status")).toBeVisible();
  });

  test("rien ne part avant la validation", async ({ page }) => {
    const calls = await openPreview(page);

    await page.getByRole("button", { name: "Reprendre" }).click();

    await expect(
      page.getByRole("button", { name: "Prendre une photo" })
    ).toBeVisible();
    expect(calls.uploads).toEqual([]);
  });

  /**
   * Scenario: Quota de l'événement atteint
   *   Then le bouton "Imprimer" est désactivé
   *   And un message m'explique pourquoi
   */
  test("quota de l'événement atteint : impression impossible", async ({
    page,
  }) => {
    await openPreview(page, { availability: "limit_reached" });

    await expect(print(page)).toBeDisabled();
    await expect(page.getByRole("status")).toContainText(
      "nombre maximum d'impressions de cet événement"
    );
  });

  test("impressions en pause : message adapté", async ({ page }) => {
    await openPreview(page, { availability: "paused" });

    await expect(print(page)).toBeDisabled();
    await expect(page.getByRole("status")).toContainText("patienter");
  });

  /**
   * Scenario: Galerie non publiée par défaut
   *   When je valide sans toucher à l'option galerie
   *   Then ma photo n'est pas ajoutée à la galerie
   */
  test("sans choix, la photo n'est pas publiée", async ({ page }) => {
    const calls = await openPreview(page);

    await expect(
      page.getByRole("checkbox", { name: "Ajouter à la galerie" })
    ).not.toBeChecked();
    await validate(page).click();

    await expect(
      page.getByRole("button", { name: "Prendre une autre photo" })
    ).toBeVisible();
    expect(calls.registers[0].p_published).toBe(false);
    expect(calls.prints).toEqual([]);
    await expect(page.getByText("Votre photo est bien envoyée.")).toBeVisible();
  });

  test("sans galerie, l'option n'est pas proposée", async ({ page }) => {
    const calls = await openPreview(page, {}, { gallery_visible: false });

    await expect(
      page.getByRole("checkbox", { name: "Ajouter à la galerie" })
    ).toHaveCount(0);
    await validate(page).click();

    await expect(
      page.getByRole("button", { name: "Prendre une autre photo" })
    ).toBeVisible();
    expect(calls.registers[0].p_published).toBe(false);
  });

  test("le choix de l'invité est respecté", async ({ page }) => {
    const calls = await openPreview(page);

    await page.getByRole("checkbox", { name: "Ajouter à la galerie" }).check();
    await validate(page).click();

    await expect(
      page.getByRole("button", { name: "Prendre une autre photo" })
    ).toBeVisible();
    expect(calls.registers[0].p_published).toBe(true);
    await expect(page.getByText("ajoutée à la galerie")).toBeVisible();
  });

  /**
   * Scenario: Reprendre une photo
   *   When j'appuie sur "Reprendre"
   *   Then je retourne à l'accueil sans que la photo soit envoyée
   */
  test("reprendre revient à l'accueil", async ({ page }) => {
    await openPreview(page);

    await page.getByRole("button", { name: "Reprendre" }).click();

    await expect(
      page.getByRole("button", { name: "Importer une photo" })
    ).toBeVisible();
  });
});

test.describe("envoi", () => {
  /**
   * Scenario: Envoi nominal
   *   When l'envoi démarre
   *   Then une progression est visible
   *   And la photo est enregistrée dans l'événement
   */
  test("un appui sur Imprimer envoie la photo puis crée la demande", async ({
    page,
  }) => {
    const calls = await openPreview(page, { uploadDelayMs: 400 });

    await print(page).click();

    await expect(
      page.getByRole("progressbar", { name: "Progression de l'envoi" })
    ).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText("C'est noté");
    await expect(page.getByRole("status").first()).toContainText(
      "à récupérer près de l'imprimante"
    );

    expect(calls.uploads).toHaveLength(1);
    expect(calls.uploads[0].path).toContain(
      `/photos/${TEST_EVENT.id}/${GUEST_ID}/`
    );
    expect(calls.uploads[0].auth).toMatch(/^Bearer /);
    expect(calls.registers).toHaveLength(1);
    expect(calls.prints).toHaveLength(1);
    expect(calls.prints[0].p_photo_id).toBe(calls.registers[0].p_photo_id);
  });

  test("la photo part compressée en JPEG", async ({ page }) => {
    const calls = await openPreview(page);

    await print(page).click();
    await expect(page.getByRole("status").first()).toContainText("C'est noté");

    expect(calls.uploads[0].body?.subarray(0, 2).toString("hex")).toBe("ffd8");
  });

  test("les grandes photos sont réduites, les petites intactes", () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 2048, height: 1536 });
    expect(targetSize(3000, 4000)).toEqual({ width: 1536, height: 2048 });
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  /**
   * Scenario: Coupure réseau pendant l'envoi
   *   When le réseau est coupé puis revient
   *   Then l'envoi reprend automatiquement
   *   And une seule photo est créée
   */
  test("une coupure relance l'envoi tout seul", async ({ page }) => {
    const calls = await openPreview(page, { uploadFailures: 1 });

    await print(page).click();

    await expect(page.getByText("nous réessayons")).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText("C'est noté", {
      timeout: 10_000,
    });
    expect(calls.registers).toHaveLength(1);
    expect(calls.prints).toHaveLength(1);
  });

  /** Cas limite : réponse perdue, le fichier est déjà là au nouvel essai. */
  test("un fichier déjà présent ne bloque pas l'envoi", async ({ page }) => {
    const calls = await openPreview(page, { uploadStatus: 409 });

    await print(page).click();

    await expect(page.getByRole("status").first()).toContainText("C'est noté");
    expect(calls.registers).toHaveLength(1);
  });

  /**
   * Scenario: Échec définitif
   *   When l'envoi échoue après plusieurs tentatives
   *   Then un message simple s'affiche
   *   And un bouton "Réessayer" est proposé
   */
  test("échec définitif : message simple et nouvel essai", async ({ page }) => {
    test.setTimeout(45_000);
    const backend = { uploadFailures: 5 };
    const calls = await openPreview(page, backend);

    await validate(page).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "n'a pas pu être envoyée" })
    ).toBeVisible({ timeout: 25_000 });
    expect(calls.registers).toEqual([]);

    await page.getByRole("button", { name: "Réessayer sans imprimer" }).click();

    await expect(
      page.getByRole("button", { name: "Prendre une autre photo" })
    ).toBeVisible();
    expect(calls.registers).toHaveLength(1);
  });

  /**
   * Scenario: Double validation
   *   When je valide deux fois de suite
   *   Then une seule photo est créée
   */
  test("un double appui n'envoie qu'une photo", async ({ page }) => {
    const calls = await openPreview(page, { uploadDelayMs: 300 });

    await print(page).dblclick();

    await expect(page.getByRole("status").first()).toContainText("C'est noté");
    expect(calls.uploads).toHaveLength(1);
    expect(calls.registers).toHaveLength(1);
    expect(calls.prints).toHaveLength(1);
  });

  test("valider sans imprimer puis imprimer n'envoie pas deux fois", async ({
    page,
  }) => {
    const calls = await openPreview(page);

    await validate(page).click();
    await expect(
      page.getByRole("button", { name: "Prendre une autre photo" })
    ).toBeVisible();
    await print(page).click();

    await expect(page.getByRole("status").first()).toContainText("C'est noté");
    expect(calls.uploads).toHaveLength(1);
    expect(calls.prints).toHaveLength(1);
  });
});

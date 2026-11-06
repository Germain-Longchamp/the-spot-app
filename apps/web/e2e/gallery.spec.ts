import { test, expect, Page } from "@playwright/test";
import {
  GUEST_ID,
  json,
  mockGuestBackend,
  mockPhotoBackend,
  TEST_EVENT,
} from "./support/guest-mocks";
import { GALLERY_PAGE_SIZE } from "../lib/guest/gallery";

const GALLERY = "/e/jeton-de-test/galerie";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const row = (id: string) => ({
  id,
  storage_path: `${TEST_EVENT.id}/someone/${id}.jpg`,
  thumb_path: `${TEST_EVENT.id}/someone/${id}-thumb.jpg`,
});

/** Fakes the published photos and their files; records what was asked. */
async function mockGallery(page: Page, ids: string[], options: { missing?: string[] } = {}) {
  const asked = { queries: [] as string[], signed: [] as string[] };

  await page.route("**/rest/v1/photos?**", (route) => {
    const url = new globalThis.URL(route.request().url());
    asked.queries.push(url.search);
    const from = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? GALLERY_PAGE_SIZE);
    return json(route, ids.slice(from, from + limit).map(row));
  });
  await page.route("**/storage/v1/object/sign/photos", (route) => {
    const { paths } = route.request().postDataJSON() as { paths: string[] };
    asked.signed.push(...paths);
    return json(
      route,
      paths.map((path) => ({ path, error: null, signedURL: `/object/sign/photos/${path}?token=t` }))
    );
  });
  await page.route("**/storage/v1/object/sign/photos/**", (route) => {
    const missing = (options.missing ?? []).some((id) => route.request().url().includes(id));
    return missing
      ? route.fulfill({ status: 404, body: "" })
      : route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
  return asked;
}

async function openGallery(page: Page, event: Partial<typeof TEST_EVENT> = {}) {
  await mockGuestBackend(page, {
    event: { gallery_enabled: true, gallery_visible: true, ...event },
  });
}

const thumbs = (page: Page) => page.getByRole("img", { name: "Photo de la galerie" });

/**
 * Scenario: Galerie visible
 *   Given la galerie est visible et contient des photos publiées
 *   Then je vois les photos publiées, les plus récentes en premier
 */
test("galerie ouverte : grille des photos publiées, les plus récentes d'abord", async ({
  page,
}) => {
  await openGallery(page);
  const asked = await mockGallery(page, ["p3", "p2", "p1"]);
  await page.goto(GALLERY);

  await expect(thumbs(page)).toHaveCount(3);
  const query = decodeURIComponent(asked.queries[0]);
  expect(query).toContain("is_published=eq.true");
  expect(query).toContain(`event_id=eq.${TEST_EVENT.id}`);
  expect(query).toContain("order=created_at.desc");
  // Light thumbnails in the grid, not the full images.
  expect(asked.signed.every((path) => path.endsWith("-thumb.jpg"))).toBe(true);
});

/**
 * Scenario: Galerie cachée
 *   Then je vois un message m'indiquant qu'elle sera disponible plus tard
 *   And aucune photo n'est chargée
 */
test("galerie cachée : message clair et aucune photo demandée", async ({ page }) => {
  await openGallery(page, { gallery_visible: false });
  const asked = await mockGallery(page, ["p1"]);
  await page.goto(GALLERY);

  await expect(page.getByText("La galerie sera disponible plus tard")).toBeVisible();
  await expect(thumbs(page)).toHaveCount(0);
  expect(asked.queries).toEqual([]);
});

test("événement sans galerie : même message, rien de chargé", async ({ page }) => {
  await openGallery(page, { gallery_enabled: false, gallery_visible: true });
  const asked = await mockGallery(page, ["p1"]);
  await page.goto(GALLERY);

  await expect(page.getByText("La galerie sera disponible plus tard")).toBeVisible();
  expect(asked.queries).toEqual([]);
});

test("galerie vide : invitation à partager sa photo", async ({ page }) => {
  await openGallery(page);
  await mockGallery(page, []);
  await page.goto(GALLERY);

  await expect(page.getByText("Aucune photo pour l'instant")).toBeVisible();
});

test("agrandir une photo puis la fermer", async ({ page }) => {
  await openGallery(page);
  const asked = await mockGallery(page, ["p1"]);
  await page.goto(GALLERY);

  await page.getByRole("button", { name: "Agrandir la photo" }).click();

  const viewer = page.getByRole("dialog", { name: "Photo agrandie" });
  await expect(viewer.getByRole("img", { name: "Photo agrandie" })).toBeVisible();
  expect(asked.signed).toContain(row("p1").storage_path);

  await viewer.getByRole("button", { name: "Fermer" }).click();
  await expect(viewer).toHaveCount(0);
});

test("beaucoup de photos : chargées par pages", async ({ page }) => {
  await openGallery(page);
  const ids = Array.from({ length: GALLERY_PAGE_SIZE + 5 }, (_, i) => `p${i}`);
  await mockGallery(page, ids);
  await page.goto(GALLERY);

  await expect(thumbs(page)).toHaveCount(GALLERY_PAGE_SIZE);
  await page.getByRole("button", { name: "Voir plus de photos" }).click();

  await expect(thumbs(page)).toHaveCount(ids.length);
  await expect(page.getByRole("button", { name: "Voir plus de photos" })).toHaveCount(0);
});

test("une photo supprimée pendant la consultation disparaît", async ({ page }) => {
  await openGallery(page);
  await mockGallery(page, ["p2", "p1"], { missing: ["p1"] });
  await page.goto(GALLERY);

  await expect(thumbs(page)).toHaveCount(1);
});

test("réseau coupé : message simple et bouton pour réessayer", async ({ page }) => {
  await openGallery(page);
  await page.route("**/rest/v1/photos?**", (route) => route.abort("internetdisconnected"));
  await page.clock.install();
  await page.goto(GALLERY);
  await expect(page.getByText("Chargement de la galerie…")).toBeVisible();
  // The Supabase client retries a failed read before giving up.
  await page.clock.runFor(60_000);

  await expect(page.getByText("Les photos n'ont pas pu être chargées")).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
});

test("lien de l'accueil vers la galerie, et retour", async ({ page }) => {
  await openGallery(page);
  await mockGallery(page, ["p1"]);
  await page.route("**/rest/v1/print_jobs?**", (route) => json(route, []));
  await page.goto("/e/jeton-de-test");

  await page.getByRole("link", { name: "Voir la galerie" }).click();
  await expect(page).toHaveURL(/\/galerie$/);
  await expect(thumbs(page)).toHaveCount(1);

  await page.getByRole("link", { name: "Retour à l'accueil" }).click();
  await expect(page.getByRole("button", { name: "Prendre une photo" })).toBeVisible();
});

test("lien invalide : même message neutre que l'accueil", async ({ page }) => {
  await mockGuestBackend(page, { entry: "invalid" });
  await page.goto(GALLERY);

  await expect(page.getByText("Ce lien n'est pas valide")).toBeVisible();
});

test("une photo publiée part avec sa vignette, une photo privée sans", async ({ page }) => {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  const calls = await mockPhotoBackend(page);
  await page.goto("/e/jeton-de-test");
  await page.getByRole("button", { name: "Importer une photo" }).waitFor();
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("checkbox", { name: "Ajouter à la galerie" }).check();
  await page.getByRole("button", { name: "Valider sans imprimer" }).click();
  await expect(page.getByText("ajoutée à la galerie")).toBeVisible();

  const paths = calls.uploads.map((upload) => upload.path);
  expect(paths).toHaveLength(2);
  expect(paths[0]).toMatch(new RegExp(`/${GUEST_ID}/[^/]+\\.jpg$`));
  expect(paths[1]).toMatch(/-thumb\.jpg$/);
  expect(calls.registers[0].p_with_thumb).toBe(true);
});

test("une photo non publiée n'envoie pas de vignette", async ({ page }) => {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  const calls = await mockPhotoBackend(page);
  await page.goto("/e/jeton-de-test");
  await page.getByRole("button", { name: "Importer une photo" }).waitFor();
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Valider sans imprimer" }).click();
  await expect(page.getByText("Votre photo est bien envoyée.")).toBeVisible();

  expect(calls.uploads).toHaveLength(1);
  expect(calls.registers[0].p_with_thumb).toBe(false);
});

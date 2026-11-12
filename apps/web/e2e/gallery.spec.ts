import { test, expect, Page } from "@playwright/test";
import {
  GUEST_ID,
  json,
  mockGuestBackend,
  mockPhotoBackend,
  TEST_EVENT,
} from "./support/guest-mocks";
import { mockGallery, PNG, row } from "./support/gallery-mocks";
import { GALLERY_PAGE_SIZE } from "../lib/guest/gallery";

const GALLERY = "/e/jeton-de-test/galerie";

async function openGallery(page: Page, event: Partial<typeof TEST_EVENT> = {}) {
  await mockGuestBackend(page, {
    event: { gallery_enabled: true, gallery_visible: true, ...event },
  });
  // The guest's own photos and prints, read for their print button.
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  await page.route("**/rest/v1/print_jobs?**", (route) => json(route, []));
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
  // No "published" filter: RLS returns the shared photos plus the guest's own.
  expect(query).not.toContain("is_published=eq");
  expect(query).toContain(`event_id=eq.${TEST_EVENT.id}`);
  expect(query).toContain("order=created_at.desc");
  // Light thumbnails in the grid, not the full images.
  expect(asked.signed.every((path) => path.endsWith("-thumb.jpg"))).toBe(true);
});

/**
 * Scenario: Galerie cachée (SCRUM-63 : on y retrouve ses propres photos)
 *   Then je vois un message m'indiquant qu'elle sera disponible plus tard
 *   And seules mes photos sont affichées (la base ne renvoie qu'elles)
 */
test("galerie cachée : message clair, et mes photos seulement", async ({ page }) => {
  await openGallery(page, { gallery_visible: false });
  await mockGallery(page, []);
  // Registered last, so it wins over the mock above.
  await page.route("**/rest/v1/gallery_photos?**", (route) =>
    json(route, [{ ...row("mine"), is_mine: true, is_published: false }])
  );
  await page.goto(GALLERY);

  await expect(page.getByText("La galerie sera disponible plus tard")).toBeVisible();
  await expect(thumbs(page)).toHaveCount(1);
  await expect(page.getByText("Non partagée")).toBeVisible();
});

test("galerie cachée sans photo à moi : invitation à en prendre une", async ({ page }) => {
  await openGallery(page, { gallery_visible: false });
  await mockGallery(page, []);
  await page.goto(GALLERY);

  await expect(page.getByText("Vos photos apparaîtront ici")).toBeVisible();
});

test("événement sans galerie : « Vos photos », sans annonce de galerie", async ({ page }) => {
  await openGallery(page, { gallery_enabled: false, gallery_visible: true });
  await mockGallery(page, []);
  await page.goto(GALLERY);

  await expect(page.getByRole("heading", { name: "Vos photos" })).toBeVisible();
  await expect(page.getByText("La galerie sera disponible plus tard")).toHaveCount(0);
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

test("réseau coupé dès l'ouverture : message simple, puis reprise seule", async ({ page }) => {
  await openGallery(page);
  const asked = await mockGallery(page, ["p1"]);
  asked.fail = true;
  await page.clock.install();
  await page.goto(GALLERY);
  await expect(page.getByText("Chargement de la galerie…")).toBeVisible();
  // The Supabase client retries a failed read before giving up.
  await page.clock.runFor(60_000);

  await expect(page.getByText("Connexion perdue, nouvelle tentative…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toHaveCount(0);

  asked.fail = false;
  await page.clock.runFor(10_000);
  await expect(thumbs(page)).toHaveCount(1);
});

test("lien de l'accueil vers la galerie, et retour", async ({ page }) => {
  await openGallery(page);
  await mockGallery(page, ["p1"]);
  await page.route("**/rest/v1/print_jobs?**", (route) => json(route, []));
  await page.goto("/e/jeton-de-test");

  await page.getByRole("link", { name: /Voir la galerie/ }).click();
  await expect(page).toHaveURL(/\/galerie$/);
  await expect(thumbs(page)).toHaveCount(1);

  await page.getByRole("link", { name: "Accueil", exact: true }).click();
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
  // Shared by default since SCRUM-63: the guest unticks it.
  await page.getByRole("checkbox", { name: "Ajouter à la galerie" }).uncheck();
  await page.getByRole("button", { name: "Valider sans imprimer" }).click();
  await expect(page.getByText("Votre photo est bien envoyée.")).toBeVisible();

  expect(calls.uploads).toHaveLength(1);
  expect(calls.registers[0].p_with_thumb).toBe(false);
});

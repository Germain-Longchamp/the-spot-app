import { test, expect, Locator, Page } from "@playwright/test";
import { fakeJob, mockAlbum } from "./support/album-mocks";
import { mockGuestBackend } from "./support/guest-mocks";

// SCRUM-69 — "Vos tirages" is a print queue: each print as it will come out,
// no page behind it, full screen on a tap.

const URL = "/e/jeton-de-test";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-06T14:00:00Z") });
});

const cards = (page: Page) => page.getByTestId("print-card");

async function openPrints(page: Page) {
  await mockGuestBackend(page);
  await page.goto(`${URL}#tirages`);
  await expect(page.getByRole("heading", { name: "Vos tirages" })).toBeVisible();
}

/** Where the photo sits in its window, relative to the window (0 to 1). */
async function photoPlacement(card: Locator) {
  const photo = card.getByTestId("print-photo");
  await expect(photo).toBeVisible();
  const [img, frame] = await Promise.all([
    photo.boundingBox(),
    photo.locator("xpath=..").boundingBox(),
  ]);
  return {
    x: (frame!.x - img!.x) / img!.width,
    y: (frame!.y - img!.y) / img!.height,
    w: frame!.width / img!.width,
    h: frame!.height / img!.height,
  };
}

/**
 * Scenario: Chaque tirage de la file montre le tirage complet
 *   Given une demande avec « Salon démo » et « Merci ! »
 *   Then la carte montre le tirage en miniature, cadre blanc compris
 *   And la photo y est cadrée selon la zone enregistrée
 *   And les deux lignes figurent dans la bande du tirage
 *   And la carte n'affiche plus le texte entre guillemets
 */
test("la carte montre le tirage complet : cadre, cadrage enregistré, texte", async ({ page }) => {
  const crop = { x: 0.3, y: 0, w: 0.4, h: 1 };
  await mockAlbum(page, {
    photos: [{ id: "a", crop }],
    jobs: [{ ...fakeJob("j1", "PENDING", "a"), frame_line1: "Salon démo", frame_line2: "Merci !" }],
    ahead: { a: 0 },
  });
  await openPrints(page);

  const card = cards(page).first();
  const sheet = card.getByTestId("print-page");
  await expect(sheet).toBeVisible();
  // A small print, white paper around the photo.
  const sheetBox = (await sheet.boundingBox())!;
  expect(sheetBox.width).toBeCloseTo(96, 0);
  const frameBox = (await card.getByTestId("print-photo").locator("xpath=..").boundingBox())!;
  expect(frameBox.x).toBeGreaterThan(sheetBox.x);
  expect(frameBox.width).toBeLessThan(sheetBox.width);

  const placed = await photoPlacement(card);
  for (const key of ["x", "y", "w", "h"] as const) {
    expect(placed[key]).toBeCloseTo(crop[key], 2);
  }

  await expect(card.getByTestId("print-line1")).toHaveText("Salon démo");
  await expect(card.getByTestId("print-line2")).toContainText("Merci !", { ignoreCase: true });
  await expect(card).not.toContainText("«");
});

/**
 * Scenario: Plus de page détail
 *   When il touche le texte de la carte
 *   Then il reste sur « Vos tirages »
 *   And aucun chevron n'est affiché
 */
test("toucher la carte n'ouvre plus de page détail, et pas de chevron", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 1 } });
  await openPrints(page);

  const card = cards(page).first();
  // The card itself is no button: only its print is.
  await expect(card.getByRole("button")).toHaveCount(1);
  await expect(card.getByRole("button")).toHaveAccessibleName("Voir ce tirage en grand");
  await card.getByText("1 photo avant la vôtre").click();

  await expect(page.getByRole("heading", { name: "Vos tirages" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Votre photo" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Étapes de l'impression" })).toHaveCount(0);
});

/**
 * Scenario: Le tirage s'affiche en grand
 *   When il touche la miniature d'un tirage
 *   Then le tirage s'affiche en plein écran avec son cadre et son texte
 *   When il ferme le plein écran
 *   Then il retrouve « Vos tirages »
 */
test("toucher la miniature affiche le tirage en grand, fermer ramène à la file", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }, { id: "b" }],
    jobs: [
      { ...fakeJob("j1", "PENDING", "a"), frame_line1: "Salon démo" },
      fakeJob("j2", "PENDING", "b", "2026-11-06T13:40:00.000Z"),
    ],
    ahead: { a: 0, b: 1 },
  });
  await openPrints(page);

  await cards(page).first().getByRole("button", { name: "Voir ce tirage en grand" }).click();

  const zoom = page.getByRole("dialog", { name: "Tirage en grand" });
  await expect(zoom).toBeVisible();
  await expect(zoom.getByTestId("print-page")).toBeVisible();
  await expect(zoom.getByTestId("print-line1")).toHaveText("Salon démo");
  // The full image, not the thumbnail, once signed.
  await expect(zoom.getByTestId("print-photo")).toHaveAttribute("src", /a\.jpg/);

  await zoom.getByRole("button", { name: "Fermer" }).click();
  await expect(zoom).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Vos tirages" })).toBeVisible();
  await expect(cards(page)).toHaveCount(2);
});

/**
 * Scenario: La place dans la file reste visible
 *   Given deux demandes attendent avant celle de l'invité
 *   Then la carte indique « 2 photos avant la vôtre »
 *   And l'état de l'imprimante est affiché sur l'écran
 */
test("la place dans la file et l'état de l'imprimante restent visibles", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 2 } });
  await openPrints(page);

  await expect(cards(page).first()).toContainText("2 photos avant la vôtre");
  await expect(page.getByTestId("printer-status")).toBeVisible();
});

/**
 * Scenario: Photo sans zone de cadrage
 *   Then la miniature montre la photo centrée dans le cadre
 */
test("photo sans zone de cadrage : centrée, comme l'agent", async ({ page }) => {
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 0 } });
  await openPrints(page);

  const photo = cards(page).first().getByTestId("print-photo");
  await expect(photo).toBeVisible();
  const fit = await photo.evaluate((img) => {
    const css = getComputedStyle(img);
    return { fit: css.objectFit, position: css.objectPosition };
  });
  expect(fit).toEqual({ fit: "cover", position: "50% 50%" });
});

/** Cas limite : photo indisponible, le cadre et le texte restent. */
test("photo indisponible : le tirage garde son cadre et son texte", async ({ page }) => {
  await mockAlbum(page, {
    photos: [{ id: "a" }],
    jobs: [{ ...fakeJob("j1", "PENDING", "a"), frame_line1: "Salon démo" }],
    ahead: { a: 0 },
  });
  // No signed link for the photo.
  await page.route("**/storage/v1/object/sign/photos", (route) =>
    route.fulfill({ json: [], headers: { "access-control-allow-origin": "*" } })
  );
  await openPrints(page);

  const card = cards(page).first();
  await expect(card.getByRole("img", { name: "Photo indisponible" })).toBeVisible();
  await expect(card.getByTestId("print-line1")).toHaveText("Salon démo");
  // Nothing to show in large.
  await expect(card.getByRole("button")).toHaveCount(0);
});

/** Cas limite : petit téléphone, la carte tient sans débordement. */
test("320 px : carte sans débordement horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockAlbum(page, { photos: [{ id: "a" }], jobs: [fakeJob("j1", "PENDING", "a")], ahead: { a: 12 } });
  await openPrints(page);

  await expect(cards(page).first()).toContainText("12 photos avant la vôtre");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

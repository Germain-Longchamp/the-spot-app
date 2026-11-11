import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import { mockGuestBackend, mockPhotoBackend } from "./support/guest-mocks";

const URL = "/e/jeton-de-test";
const NAME = "The Spot Memories";

// Proportions of the designer's files (viewBox), and the drawing inside them.
const CANVAS_RATIO = 805.5 / 586.8;
const DRAWING_SHARE = (805.5 - 80) / 805.5;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

async function openHome(page: Page) {
  await mockGuestBackend(page);
  await page.route("**/rest/v1/photos?**", (route) =>
    route.fulfill({ json: [], headers: { "access-control-allow-origin": "*" } })
  );
  await page.goto(URL);
  await expect(
    page.getByRole("button", { name: "Prendre une photo" })
  ).toBeVisible();
}

const logo = (page: Page) => page.getByRole("img", { name: NAME });

/**
 * Scenario: Logo sur l'accueil de l'événement
 *   Then le logo complet en version couleur est affiché (thème clair, SCRUM-46)
 *   And il mesure au moins 200 px de large
 *   And ses proportions sont celles du fichier fourni
 * SCRUM-51 — Scenario: Logo plus petit
 *   Then le logo est plus petit qu'avant (232 px) et reste au-dessus de sa taille minimale
 */
test("accueil : logo complet couleur, assez grand, non déformé", async ({ page }) => {
  await openHome(page);

  await expect(logo(page)).toBeVisible();
  await expect(logo(page)).toHaveAttribute("src", /logo-complet-couleur\.svg$/);
  await expect(logo(page)).toHaveJSProperty("complete", true);

  const box = await logo(page).boundingBox();
  expect(box!.width * DRAWING_SHARE).toBeGreaterThanOrEqual(200);
  expect(box!.width).toBeLessThan(232);
  expect(box!.width / box!.height).toBeCloseTo(CANVAS_RATIO, 1);

  const natural = await logo(page).evaluate((img: HTMLImageElement) => ({
    width: img.naturalWidth,
    height: img.naturalHeight,
  }));
  expect(natural.width / natural.height).toBeCloseTo(CANVAS_RATIO, 1);
});

test("le fichier affiché est bien la version couleur de la designer", () => {
  const svg = readFileSync(
    join(__dirname, "../public/brand/logo-complet-couleur.svg"),
    "utf8"
  );
  const fills = new Set(svg.match(/fill="#[0-9A-Fa-f]{6}"/g));
  // Charter colours only: Framboise and Pêche.
  expect([...Array.from(fills)].sort()).toEqual(['fill="#AD354E"', 'fill="#EC9A62"']);
  expect(svg).not.toMatch(/<script|on\w+=|href=/i);
});

/**
 * Scenario: Actions toujours visibles
 *   Given un téléphone de 375 x 667 px
 *   Then le logo et les deux boutons sont visibles sans défilement
 */
for (const size of [
  { width: 375, height: 667 },
  { width: 320, height: 568 },
]) {
  test(`${size.width} x ${size.height} : logo et actions sans défilement`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openHome(page);

    for (const target of [
      logo(page),
      page.getByRole("button", { name: "Prendre une photo" }),
      page.getByRole("button", { name: "Importer une photo" }),
    ]) {
      const box = await target.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
  });
}

/**
 * Scenario: Petite place
 *   Given un emplacement où le logo complet ferait moins de 200 px
 *   Then la version sans "memories" ou l'icône est utilisée à la place
 */
test("panneau opérateur : version courte, au-dessus de sa taille minimale", async ({
  page,
}) => {
  await page.goto("/dev/operator-panel");

  await expect(logo(page)).toHaveAttribute("src", /logo-court-couleur\.svg$/);
  const box = await logo(page).boundingBox();
  expect(box!.width * DRAWING_SHARE).toBeGreaterThanOrEqual(120);
});

test("aperçu de la photo : l'icône seule, au-dessus de 16 px", async ({ page }) => {
  await mockGuestBackend(page);
  await mockPhotoBackend(page);
  await page.goto(URL);
  await page.getByRole("button", { name: "Importer une photo" }).waitFor();
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Votre photo" })).toBeVisible();

  await expect(logo(page)).toHaveAttribute("src", /icone-couleur\.svg$/);
  const box = await logo(page).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(16);
  expect(box!.width / box!.height).toBeCloseTo(1, 1);
});

test("une taille trop petite bascule sur la version plus simple", async () => {
  const { fittingVariant } = await import("../components/ui/logo");
  expect(fittingVariant("full", 256)).toBe("full");
  expect(fittingVariant("full", 200)).toBe("short");
  expect(fittingVariant("full", 120)).toBe("icon");
  expect(fittingVariant("short", 160)).toBe("short");
  expect(fittingVariant("icon", 16)).toBe("icon");
});

/**
 * Scenario: Messages de fin
 *   When j'ouvre un lien invalide ou un événement terminé
 *   Then le logo est affiché au-dessus du message
 */
for (const entry of [
  { state: "invalid", text: "Ce lien n'est pas valide" },
  { state: "closed", text: "Cet événement est terminé" },
]) {
  test(`message de fin (${entry.state}) : logo au-dessus`, async ({ page }) => {
    await mockGuestBackend(page, { entry: entry.state });
    await page.goto(URL);

    const message = page.getByText(entry.text);
    await expect(message).toBeVisible();
    await expect(logo(page)).toBeVisible();

    const logoBox = await logo(page).boundingBox();
    const messageBox = await message.boundingBox();
    expect(logoBox!.y + logoBox!.height).toBeLessThanOrEqual(messageBox!.y);
  });
}

/**
 * Scenario: Onglet et écran d'accueil
 *   Then l'onglet affiche le favicon The Spot et le titre "The Spot Memories"
 *   And l'ajout à l'écran d'accueil d'un iPhone utilise l'icône de 180 px
 */
test("onglet : favicon de la designer et titre The Spot Memories", async ({
  page,
  request,
}) => {
  await openHome(page);

  await expect(page).toHaveTitle(NAME);

  const icons = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((links) =>
      links.map((link) => ({
        rel: link.getAttribute("rel"),
        href: link.getAttribute("href")!,
        sizes: link.getAttribute("sizes"),
      }))
    );

  const svgIcon = icons.find((icon) => icon.href.includes("icon.svg"));
  const apple = icons.find((icon) => icon.rel === "apple-touch-icon");
  expect(svgIcon).toBeTruthy();
  expect(apple?.sizes).toBe("180x180");

  for (const icon of [svgIcon!, apple!, { href: "/favicon.ico" }]) {
    const response = await request.get(icon.href);
    expect(response.ok(), icon.href).toBe(true);
  }
  const svg = await (await request.get(svgIcon!.href)).text();
  expect(svg).toContain("#EC9A62");
});

/**
 * Scenario: Accessibilité
 *   Then le logo est annoncé "The Spot Memories"
 */
test("le logo est annoncé par son nom", async ({ page }) => {
  await openHome(page);

  await expect(page.getByRole("img", { name: NAME })).toHaveCount(1);
});

test("logo non chargé : le nom s'affiche et l'accueil reste utilisable", async ({
  page,
}) => {
  await page.route("**/brand/**", (route) => route.abort("internetdisconnected"));
  await openHome(page);

  await expect(logo(page)).toHaveAttribute("alt", NAME);
  await expect(
    page.getByRole("button", { name: "Prendre une photo" })
  ).toBeEnabled();
});

test("écran caméra : pas de logo pendant la prise de vue", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Prendre une photo" }).click();
  await expect(page.getByRole("button", { name: "Prendre la photo" })).toBeVisible();

  await expect(logo(page)).toHaveCount(0);
});

test("le logo n'est ni déformé ni recoloré par du style", async ({ page }) => {
  await openHome(page);

  const style = await logo(page).evaluate((img) => {
    const css = getComputedStyle(img);
    return { filter: css.filter, transform: css.transform, objectFit: css.objectFit };
  });
  expect(style.filter).toBe("none");
  expect(style.transform).toBe("none");
});

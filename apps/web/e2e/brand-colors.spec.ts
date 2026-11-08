import { test, expect, Page } from "@playwright/test";
import { brand, colors, retiredColors } from "../lib/ui/tokens";
import { mockGuestBackend } from "./support/guest-mocks";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

/** Every color a page actually paints, text and backgrounds kept apart. */
async function paintedColors(page: Page) {
  return page.evaluate(() => {
    const text = new Set<string>();
    const fills = new Set<string>();
    for (const element of Array.from(document.querySelectorAll("body *"))) {
      const style = getComputedStyle(element);
      const hasText = Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      );
      if (hasText) text.add(style.color);
      fills.add(style.backgroundColor);
      fills.add(style.borderTopColor);
    }
    return { text: Array.from(text), fills: Array.from(fills) };
  });
}

const URL = "/e/jeton-de-test";

async function openGuestHome(page: Page) {
  await mockGuestBackend(page);
  await page.route("**/rest/v1/photos?**", (route) =>
    route.fulfill({ json: [], headers: { "access-control-allow-origin": "*" } })
  );
  await page.goto(URL);
  await expect(
    page.getByRole("button", { name: "Prendre une photo" })
  ).toBeVisible();
}

test("les couleurs sont celles de la charte, sans variante", () => {
  expect(brand.framboise).toBe("#AD354E");
  expect(brand.peche).toBe("#EC9A62");
  // Light theme (SCRUM-46): Framboise carries the actions, Pêche decorates.
  expect(colors.accent).toBe(brand.framboise);
  expect(colors.brand).toBe(brand.peche);
});

/**
 * Scenario: Actions principales aux couleurs de la marque (thème clair, SCRUM-46)
 *   Then les boutons "Prendre une photo" et "Importer une photo" sont en Framboise
 *   And leur texte est blanc et lisible
 */
test("les actions principales de l'accueil sont en Framboise, texte blanc", async ({ page }) => {
  await openGuestHome(page);

  for (const name of ["Prendre une photo", "Importer une photo"]) {
    const button = page.getByRole("button", { name });
    await expect(button).toHaveCSS("background-color", rgb(colors.accent));
    await expect(button).toHaveCSS("color", rgb(colors.onAccent));
  }
  expect(contrast(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(4.5);
});

/**
 * Scenario: Contraste de tous les textes
 *   Then chaque couple texte / fond utilisé atteint au moins 4,5:1
 *   And chaque élément graphique utile atteint au moins 3:1
 */
test("chaque texte atteint 4,5:1 et chaque élément graphique 3:1", () => {
  const backgrounds = [colors.background, colors.surface];
  const texts = [
    colors.foreground,
    colors.muted,
    colors.accent,
    colors.success,
    colors.danger,
  ];
  for (const text of texts) {
    for (const background of backgrounds) {
      expect(contrast(text, background), `${text} sur ${background}`)
        .toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(contrast(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.onBrand, colors.brand)).toBeGreaterThanOrEqual(4.5);

  // Outlines, status dots and the main button's shape.
  for (const graphic of [colors.border, colors.accent, colors.success, colors.danger]) {
    for (const background of backgrounds) {
      expect(contrast(graphic, background), `${graphic} sur ${background}`)
        .toBeGreaterThanOrEqual(3);
    }
  }
});

const screens = [
  { name: "accueil invité", open: openGuestHome },
  { name: "composants", open: (page: Page) => page.goto("/dev/ui") },
  { name: "panneau opérateur", open: (page: Page) => page.goto("/dev/operator-panel") },
];

/**
 * Scenario: Pêche jamais en texte sur fond clair (SCRUM-46)
 *   Then le Pêche n'est associé à aucun texte : son contraste est trop faible
 */
for (const screen of screens) {
  test(`${screen.name} : aucun texte en Pêche`, async ({ page }) => {
    await screen.open(page);
    await page.waitForLoadState("networkidle");

    const { text } = await paintedColors(page);

    expect(contrast(colors.brand, colors.background)).toBeLessThan(4.5);
    expect(text).not.toContain(rgb(colors.brand));
  });
}

/**
 * Scenario: Aucun écran oublié
 *   Then aucune des anciennes couleurs provisoires (ambre, sarcelle) n'apparaît
 */
for (const screen of screens) {
  test(`${screen.name} : aucune ancienne couleur`, async ({ page }) => {
    await screen.open(page);
    await page.waitForLoadState("networkidle");

    const { text, fills } = await paintedColors(page);

    for (const retired of retiredColors) {
      expect([...text, ...fills]).not.toContain(rgb(retired));
    }
  });
}

test("aucune ancienne couleur dans le code", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|css)$/.test(entry)) files.push(path);
    }
  };
  ["app", "components", "lib"].forEach(walk);

  for (const file of files) {
    if (file.endsWith(join("lib", "ui", "tokens.ts"))) continue;
    const source = readFileSync(file, "utf8").toUpperCase();
    for (const retired of retiredColors) {
      expect(source, file).not.toContain(retired.toUpperCase());
    }
  }
});

/**
 * Scenario: Typographie de l'interface
 *   Then les textes s'affichent en Inter
 *   And aucune police n'est chargée depuis un serveur tiers
 */
test("les textes sont en Inter, servie par l'application", async ({ page }) => {
  const thirdParty: string[] = [];
  page.on("request", (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) {
      thirdParty.push(request.url());
    }
  });

  await openGuestHome(page);
  await page.evaluate(() => document.fonts.ready);

  const family = await page
    .getByRole("button", { name: "Prendre une photo" })
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(family).toMatch(/Inter/);
  expect(
    await page.evaluate(() =>
      Array.from(document.fonts).some(
        (font) => /Inter/.test(font.family) && font.status === "loaded"
      )
    )
  ).toBe(true);
  expect(thirdParty).toEqual([]);
});

/**
 * Scenario: États toujours reconnaissables
 *   Given l'agent d'impression est hors ligne
 *   Then son statut est affiché en texte et pas seulement par une couleur
 *   And ce statut se distingue des couleurs de marque
 */
test("imprimante hors ligne : texte et couleur d'état distincte de la marque", async ({
  page,
}) => {
  await page.goto("/dev/ui");

  const status = page.locator('[data-testid="printer-status"][data-state="offline"]');
  await expect(status).toHaveText("L'imprimante n'est pas connectée pour le moment");

  const dot = status.locator("span");
  await expect(dot).toHaveCSS("background-color", rgb(colors.danger));
  expect(colors.danger).not.toBe(colors.brand);
  expect(colors.danger).not.toBe(colors.accent);
  expect(contrast(colors.danger, colors.brand)).toBeGreaterThan(1.5);
});

test("un bouton désactivé reste lisible et se distingue d'un bouton actif", async ({
  page,
}) => {
  await page.goto("/dev/ui");

  const active = page.getByRole("button", { name: "Action principale" });
  const disabled = page.getByRole("button", { name: "Action désactivée" });

  await expect(disabled).toBeDisabled();
  const opacity = await disabled.evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBeLessThan(1);
  expect(Number(opacity)).toBeGreaterThanOrEqual(0.5);
  await expect(active).toHaveCSS("opacity", "1");
});

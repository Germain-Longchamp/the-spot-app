import { test, expect } from "@playwright/test";
import { colors } from "../lib/ui/tokens";

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

/**
 * Scenario: Composants disponibles
 *   When j'ouvre la page de démonstration
 *   Then je vois les composants de base dans tous leurs états
 */
test("les composants de base sont disponibles dans leurs états", async ({
  page,
}) => {
  await page.goto("/dev/ui");

  await expect(
    page.getByRole("button", { name: "Action principale" })
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Action désactivée" })
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Patientez…" })).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: "Un souci" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Chargement…");
});

/**
 * Scenario: Cohérence des couleurs
 *   When un écran affiche un état de succès, d'erreur ou en ligne
 *   Then il utilise les couleurs définies pour cet usage
 */
test("chaque état utilise sa couleur", async ({ page }) => {
  await page.goto("/dev/ui");

  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    rgb(colors.background)
  );
  await expect(
    page.getByRole("button", { name: "Action principale" })
  ).toHaveCSS("background-color", rgb(colors.accent));
  await expect(
    page.locator('[data-state="online"] span')
  ).toHaveCSS("background-color", rgb(colors.success));
  await expect(
    page.locator('[data-state="offline"] span')
  ).toHaveCSS("background-color", rgb(colors.danger));
  await expect(page.getByRole("alert").filter({ hasText: "Un souci" })).toHaveCSS("color", rgb(colors.danger));
});

/**
 * Scenario: Lisibilité
 *   When je consulte les textes principaux
 *   Then le contraste respecte la cible fixée (WCAG AA, 4,5:1)
 */
test("les contrastes respectent la cible", () => {
  const pairs: [string, string][] = [
    [colors.foreground, colors.background],
    [colors.foreground, colors.surface],
    [colors.muted, colors.background],
    [colors.muted, colors.surface],
    [colors.danger, colors.background],
    [colors.danger, colors.surface],
    [colors.success, colors.background],
    [colors.onAccent, colors.accent],
    [colors.onBrand, colors.brand],
  ];

  for (const [text, background] of pairs) {
    expect(
      contrast(text, background),
      `${text} sur ${background}`
    ).toBeGreaterThanOrEqual(4.5);
  }
});

/**
 * Scenario: Petit écran
 *   When j'affiche les composants sur un petit téléphone
 *   Then ils restent lisibles et utilisables
 */
test("sur un petit téléphone, rien ne déborde", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/dev/ui");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow).toBe(false);

  const box = await page
    .getByRole("button", { name: "Action principale" })
    .boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

import { test, expect, Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSnapshot } from "../lib/operator/panel";

const PANEL = "/dev/operator-panel";
const PATH = "/e/jeton-de-demonstration-0123456789abcdef";

async function openSettings(page: Page, query = "") {
  await page.goto(`${PANEL}${query}`);
  await page.getByRole("tab", { name: "Paramètres" }).click();
}

/**
 * Scenario: Retrouver le QR code
 *   When j'ouvre "Paramètres"
 *   Then je vois le QR code, le lien d'accès et le code de secours
 */
test("paramètres : QR code, lien d'accès et code de secours", async ({ page, baseURL }) => {
  await openSettings(page);

  const qr = page.getByRole("img", { name: "QR code d'accès des invités" });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.getByTestId("access-url")).toHaveText(`${baseURL}${PATH}`);
  await expect(page.getByTestId("short-code")).toHaveText("BQYJ8M");
});

/**
 * Scenario: Copier le lien
 *   Then le lien d'accès est copié et un message le confirme
 */
test("copier le lien : il est dans le presse-papiers, un message le confirme", async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openSettings(page);

  await page.getByRole("button", { name: "Copier le lien" }).click();

  await expect(page.getByText("Lien copié.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}${PATH}`);
});

test("copie refusée : le lien reste sélectionnable, sans erreur technique", async ({ page }) => {
  await openSettings(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("NotAllowedError")) },
    });
  });

  await page.getByRole("button", { name: "Copier le lien" }).click();

  await expect(page.getByText("sélectionnez le lien")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("NotAllowedError");
});

/**
 * Scenario: Télécharger le QR code
 *   Then j'obtiens une image PNG du lien d'accès
 */
test("télécharger le QR code : une image PNG nommée d'après le code", async ({ page }) => {
  await openSettings(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Télécharger le QR code" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("qr-BQYJ8M.png");
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(path!);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  // 1024 px wide: sharp enough for a poster.
  expect(bytes.readUInt32BE(16)).toBe(1024);
});

test("événement fermé : le QR reste visible, avec la mention", async ({ page }) => {
  await openSettings(page, "?closed");

  await expect(page.getByRole("img", { name: "QR code d'accès des invités" })).toBeVisible();
  await expect(page.getByText("ce QR code n'ouvre plus rien")).toBeVisible();
});

test("petit téléphone : QR lisible, sans défilement horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openSettings(page);

  const box = (await page.getByTestId("guest-qr").boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

/**
 * Scenario: Isolation
 *   Given je suis opérateur de "Salon démo"
 *   Then je ne vois jamais le lien ni le QR d'un autre événement
 * The panel reads the event of its own link only: the access path comes from
 * the row filtered on that event's id.
 */
test("le lien affiché est celui de l'événement du lien opérateur, et de lui seul", async () => {
  const filters: [string, string, unknown][] = [];
  const query = (table: string, data: unknown) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: (column: string, value: unknown) => {
        filters.push([table, column, value]);
        return chain;
      },
      is: self,
      order: self,
      limit: () => Promise.resolve({ data, error: null }),
      single: () => Promise.resolve({ data, error: null }),
    });
    return chain;
  };
  const client = {
    from: (table: string) =>
      table === "events"
        ? query(table, {
            name: "Salon démo",
            access_token: "jeton-du-salon",
            short_code: "ABC234",
            print_limit: null,
            printing_paused: false,
            status: "open",
            gallery_enabled: false,
            gallery_visible: false,
          })
        : query(table, []),
    rpc: async () => ({ data: true, error: null }),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  } as unknown as SupabaseClient;

  const snapshot = await loadSnapshot(client, "event-du-salon");

  expect(filters).toContainEqual(["events", "id", "event-du-salon"]);
  expect(snapshot.accessPath).toBe("/e/jeton-du-salon");
  expect(snapshot.shortCode).toBe("ABC234");
});

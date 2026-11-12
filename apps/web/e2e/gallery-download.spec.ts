import { test, expect, Page } from "@playwright/test";
import { downloadName } from "../lib/guest/download";
import { json, mockGuestBackend } from "./support/guest-mocks";
import { mockGallery, PNG, row } from "./support/gallery-mocks";

// SCRUM-59 — "Télécharger": save a photo of the gallery on the phone.

const GALLERY = "/e/jeton-de-test/galerie";

test.use({ viewport: { width: 390, height: 844 } });

/** The open gallery, then the first photo (someone else's) shown large. */
async function openPhoto(
  page: Page,
  options: { date?: string; sign?: "ok" | "gone" | "offline" } = {}
) {
  await mockGuestBackend(page, {
    event: { gallery_enabled: true, gallery_visible: true, event_date: options.date ?? null },
  });
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  await page.route("**/rest/v1/print_jobs?**", (route) => json(route, []));
  await mockGallery(page, ["p1", "p2"]);

  const asked: string[] = [];
  // One file signed for saving: a POST to its own path (registered last, wins).
  await page.route("**/storage/v1/object/sign/photos/**", (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      const url = new URL(request.url());
      const name = url.searchParams.get("download");
      return route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        headers: name ? { "content-disposition": `attachment; filename="${name}"` } : {},
        body: PNG,
      });
    }
    asked.push(request.url());
    if (options.sign === "offline") return route.abort("internetdisconnected");
    if (options.sign === "gone") {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }),
      });
    }
    const path = decodeURIComponent(new URL(request.url()).pathname.split("/object/sign/photos/")[1]);
    return json(route, { signedURL: `/object/sign/photos/${path}?token=t` });
  });

  await page.goto(GALLERY);
  await page.getByTestId("gallery-photo").first().click();
  await expect(page.getByRole("dialog", { name: "Photo agrandie" })).toBeVisible();
  return asked;
}

const download = (page: Page) => page.getByRole("button", { name: "Télécharger" });

test("nom du fichier : événement, date, rang, sans rien sur l'invité", () => {
  expect(downloadName("Salon démo", "2027-01-14", 7)).toBe("salon-demo-2027-01-14-7.jpg");
  expect(downloadName("Mariage d'Élise & Tom !", null, 2)).toBe("mariage-d-elise-tom-2.jpg");
  expect(downloadName("***", null, 1)).toBe("photo-1.jpg");
});

/**
 * Scenario: Télécharger depuis un ordinateur
 *   Given une photo d'un autre invité est affichée en grand dans la galerie ouverte
 *   When je touche "Télécharger"
 *   Then un fichier JPEG de cette photo est téléchargé
 */
test("ordinateur : « Télécharger » enregistre la photo en JPEG", async ({ page }) => {
  const asked = await openPhoto(page, { date: "2027-01-14" });

  const [file] = await Promise.all([page.waitForEvent("download"), download(page).click()]);

  expect(file.suggestedFilename()).toBe("salon-de-demonstration-2027-01-14-1.jpg");
  // The full image of this photo, signed for a minute only.
  expect(asked).toHaveLength(1);
  expect(decodeURIComponent(asked[0])).toContain(row("p1").storage_path);
  await expect(page.getByTestId("download-problem")).toHaveCount(0);
});

/**
 * Scenario: Partage sur téléphone
 *   Given mon navigateur permet de partager des fichiers
 *   When je touche "Télécharger"
 *   Then la feuille de partage s'ouvre avec la photo
 */
test("téléphone : la feuille de partage s'ouvre avec la photo", async ({ page }) => {
  await page.addInitScript(() => {
    const shared: { name: string; type: string }[] = [];
    (window as unknown as { shared: typeof shared }).shared = shared;
    Object.assign(navigator, {
      canShare: () => true,
      share: async ({ files }: { files: File[] }) => {
        shared.push(...files.map((f) => ({ name: f.name, type: f.type })));
      },
    });
  });
  await openPhoto(page);
  // The photo is made ready beforehand: Safari opens the sheet only within the tap.
  await expect(download(page)).toHaveAttribute("data-share-ready", "true");
  let downloaded = false;
  page.on("download", () => (downloaded = true));

  await download(page).click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { shared: unknown[] }).shared))
    .toEqual([{ name: "salon-de-demonstration-1.jpg", type: "image/jpeg" }]);
  expect(downloaded).toBe(false);
});

test("feuille de partage refermée : aucun message", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(navigator, {
      canShare: () => true,
      share: async () => {
        (window as unknown as { asked: boolean }).asked = true;
        throw new DOMException("Share canceled", "AbortError");
      },
    });
  });
  await openPhoto(page);
  await expect(download(page)).toHaveAttribute("data-share-ready", "true");

  await download(page).click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { asked?: boolean }).asked))
    .toBe(true);
  await expect(page.getByTestId("download-problem")).toHaveCount(0);
});

/**
 * Scenario: Photo supprimée
 *   Given l'équipe a supprimé la photo
 *   When je touche "Télécharger"
 *   Then le message "Cette photo n'est plus disponible" s'affiche et rien n'est téléchargé
 */
test("photo supprimée : message, et rien n'est téléchargé", async ({ page }) => {
  await openPhoto(page, { sign: "gone" });
  let downloaded = false;
  page.on("download", () => (downloaded = true));

  await download(page).click();

  await expect(page.getByTestId("download-problem")).toHaveText("Cette photo n'est plus disponible.");
  expect(downloaded).toBe(false);
});

test("réseau coupé : téléchargement impossible, réessayez", async ({ page }) => {
  await openPhoto(page, { sign: "offline" });

  await download(page).click();

  await expect(page.getByTestId("download-problem")).toHaveText(
    "Téléchargement impossible pour le moment, réessayez."
  );
});

test.describe("navigateur d'Instagram", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0",
  });

  test("conseil d'appui long sur la photo", async ({ page }) => {
    await openPhoto(page);

    await expect(
      page.getByText("Si rien ne se passe, appuyez longuement sur la photo pour l'enregistrer.")
    ).toBeVisible();
  });
});

test("ma photo jamais imprimée : « Imprimer » et « Télécharger » ensemble", async ({ page }) => {
  await mockGuestBackend(page, { event: { gallery_enabled: true, gallery_visible: true } });
  await page.route("**/rest/v1/photos?**", (route) =>
    json(route, [{ ...row("m"), thumb_path: null, created_at: "2026-11-06T13:30:00.000Z" }])
  );
  await page.route("**/rest/v1/print_jobs?**", (route) => json(route, []));
  await mockGallery(page, ["m"], { mine: ["m"] });
  await page.goto(GALLERY);
  await page.getByTestId("gallery-photo").first().click();

  await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeVisible();
  await expect(download(page)).toBeVisible();
});

import { test, expect, BrowserContext, Page } from "@playwright/test";
import { GUEST_ID, json, mockGuestBackend, TEST_EVENT } from "./support/guest-mocks";

const URL = "/e/jeton-de-test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const pathOf = (photoId: string) =>
  `${TEST_EVENT.id}/${GUEST_ID}/${photoId}.jpg`;

/** Fakes the guest's photos: the rows, their signed links and the files. */
async function mockMyPhotos(
  page: Page,
  photoIds: string[],
  options: { fail?: boolean } = {}
) {
  const queries: string[] = [];

  await page.route("**/rest/v1/photos?**", (route) => {
    queries.push(route.request().url());
    if (options.fail) return route.abort("internetdisconnected");
    return json(
      route,
      photoIds.map((id) => ({ id, storage_path: pathOf(id) }))
    );
  });
  await page.route("**/storage/v1/object/sign/photos", (route) => {
    const { paths } = route.request().postDataJSON() as { paths: string[] };
    return json(
      route,
      paths.map((path) => ({
        path,
        error: null,
        signedURL: `/object/sign/photos/${path}?token=t`,
      }))
    );
  });
  await page.route("**/storage/v1/object/sign/photos/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG })
  );

  return queries;
}

async function openEvent(context: BrowserContext, photoIds: string[] = []) {
  const page = await context.newPage();
  const calls = await mockGuestBackend(page);
  await mockMyPhotos(page, photoIds);
  await page.goto(URL);
  await expect(
    page.getByRole("button", { name: "Prendre une photo" })
  ).toBeVisible();
  return { page, calls };
}

/**
 * Scenario: Rechargement de la page
 *   Given je suis entré dans l'événement
 *   When je recharge la page
 *   Then je reste la même personne et je retrouve mes photos
 */
test("après un rechargement, même identité et mêmes photos", async ({
  context,
}) => {
  const { page, calls } = await openEvent(context, ["p-1", "p-2"]);
  await expect(page.getByRole("img", { name: "Une de vos photos" })).toHaveCount(2);
  const signups = calls.signups;

  await page.reload();

  await expect(page.getByRole("heading", { name: "Vos photos" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Une de vos photos" })).toHaveCount(2);
  expect(calls.signups).toBe(signups);
});

test("seules les photos de cet événement sont demandées", async ({ page }) => {
  await mockGuestBackend(page);
  const queries = await mockMyPhotos(page, ["p-1"]);

  await page.goto(URL);
  await expect(page.getByRole("img", { name: "Une de vos photos" })).toBeVisible();

  expect(queries[0]).toContain(`event_id=eq.${TEST_EVENT.id}`);
});

/**
 * Scenario: Nouveau navigateur
 *   Given j'ai utilisé l'événement sur un premier navigateur
 *   When j'ouvre le QR sur un autre navigateur
 *   Then une nouvelle identité est créée
 */
test("un autre navigateur crée une nouvelle identité", async ({
  context,
  browser,
}) => {
  const first = await openEvent(context);
  expect(first.calls.signups).toBeGreaterThanOrEqual(1);

  const other = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const second = await openEvent(other);

  // The other browser starts with no session: it has to sign up on its own.
  expect(second.calls.signups).toBeGreaterThanOrEqual(1);
  await other.close();
});

/**
 * Scenario: Stockage supprimé
 *   Given j'ai vidé les données du navigateur
 *   When je rouvre l'événement
 *   Then une nouvelle identité est créée sans erreur
 */
test("données du navigateur vidées : nouvelle identité, sans erreur", async ({
  context,
}) => {
  const { page, calls } = await openEvent(context);
  const before = calls.signups;
  expect(before).toBeGreaterThanOrEqual(1);

  await context.clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(URL);

  await expect(
    page.getByRole("button", { name: "Prendre une photo" })
  ).toBeVisible();
  await expect(page.locator("main [role=alert]")).toHaveCount(0);
  expect(calls.signups).toBeGreaterThan(before);
});

test("sans photo envoyée, la section n'apparaît pas", async ({ context }) => {
  const { page } = await openEvent(context, []);

  await expect(page.getByRole("heading", { name: "Vos photos" })).toHaveCount(0);
});

test("si les photos ne se chargent pas, l'accueil reste utilisable", async ({
  page,
}) => {
  await mockGuestBackend(page);
  await mockMyPhotos(page, ["p-1"], { fail: true });

  await page.goto(URL);

  await expect(
    page.getByRole("button", { name: "Prendre une photo" })
  ).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Vos photos" })).toHaveCount(0);
  await expect(page.locator("main [role=alert]")).toHaveCount(0);
});

import { test, expect, Page } from "@playwright/test";
import { guestStatusLabel, PrintJobStatus } from "../lib/print/job-status";
import { requestTime } from "../lib/print/my-prints";
import { json, mockGuestBackend, mockPhotoBackend, TEST_EVENT } from "./support/guest-mocks";

const URL = "/e/jeton-de-test";
const RAW = /PENDING|PRINTING|DONE|STUCK|FAILED|CANCELLED/;
const POLL_MS = 5_000;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

interface Job {
  id: string;
  photo_id: string;
  status: PrintJobStatus;
  created_at: string;
}

const job = (id: string, status: PrintJobStatus, photo = `photo-${id}`): Job => ({
  id,
  photo_id: photo,
  status,
  created_at: "2026-11-06T13:32:00.000Z",
});

/**
 * Fakes the guest's print requests. The returned object can be changed to
 * simulate the operator and the agent moving a job along.
 */
async function mockPrints(
  page: Page,
  initial: Job[],
  options: { printerOnline?: boolean } = {}
) {
  const state = { jobs: initial, fail: false, queries: [] as string[] };

  await page.route("**/rest/v1/print_jobs?**", (route) => {
    state.queries.push(route.request().url());
    if (state.fail) return route.abort("internetdisconnected");
    return json(route, state.jobs);
  });
  await page.route("**/rest/v1/rpc/get_printer_status", (route) =>
    json(route, options.printerOnline ?? true)
  );
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  return state;
}

async function openHome(page: Page) {
  await mockGuestBackend(page);
  await page.goto(URL);
  await expect(
    page.getByRole("button", { name: "Prendre une photo" })
  ).toBeVisible();
}

const tracking = (page: Page) => page.getByTestId("my-prints");
const requests = (page: Page) => page.getByTestId("print-request");

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-06T14:00:00Z") });
});

/**
 * Scenario: Suivi d'une demande
 *   Given j'ai demandé une impression
 *   When j'arrive sur l'écran de suivi
 *   Then je vois l'état de ma demande en langage clair
 *   And l'état de l'imprimante est visible
 */
test("après « Imprimer », l'état de la demande et de l'imprimante sont visibles", async ({
  page,
}) => {
  await mockGuestBackend(page);
  const photo = await mockPhotoBackend(page);
  const prints = await mockPrints(page, []);
  await page.goto(URL);
  await page.getByRole("button", { name: "Importer une photo" }).waitFor();
  await page
    .getByLabel("Choisir une photo")
    .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Votre photo" })).toBeVisible();

  // The new request appears once the print is created.
  await page.route("**/rest/v1/rpc/create_print_job", async (route) => {
    const body = route.request().postDataJSON();
    prints.jobs = [job("j1", "PENDING", body.p_photo_id)];
    return json(route, { result: "created", job_id: "j1" });
  });
  await page.getByRole("button", { name: "Imprimer", exact: true }).click();

  await expect(tracking(page)).toBeVisible();
  await expect(tracking(page)).toContainText(
    "En attente de validation par l'équipe"
  );
  await expect(page.getByTestId("printer-status")).toContainText(
    "L'imprimante est connectée"
  );
  await expect(page.locator("body")).not.toContainText(RAW);
  expect(photo.registers).toHaveLength(1);
});

test("l'accueil liste mes demandes, chacune avec son état", async ({ page }) => {
  await mockPrints(page, [
    job("j2", "PRINTING"),
    job("j1", "DONE"),
  ]);
  await openHome(page);

  await expect(requests(page)).toHaveCount(2);
  await expect(requests(page).nth(0)).toContainText("Impression en cours");
  await expect(requests(page).nth(1)).toContainText(
    "Votre photo est prête, à récupérer près de l'imprimante"
  );
  await expect(tracking(page).getByTestId("printer-status")).toBeVisible();
  await expect(requests(page).first()).toContainText(
    `Demandée à ${requestTime("2026-11-06T13:32:00.000Z")}`
  );
});

test("seules les demandes de cet événement sont demandées", async ({ page }) => {
  const prints = await mockPrints(page, [job("j1", "PENDING")]);
  await openHome(page);
  await expect(requests(page)).toHaveCount(1);

  expect(prints.queries[0]).toContain(`event_id=eq.${TEST_EVENT.id}`);
});

test("sans demande, aucune section de suivi", async ({ page }) => {
  await mockPrints(page, []);
  await openHome(page);

  await expect(tracking(page)).toHaveCount(0);
});

/**
 * Scenario: Impression prête
 *   Given mon job passe en DONE
 *   When l'écran se met à jour
 *   Then je vois que ma photo est prête à être récupérée près de l'imprimante
 */
test("l'écran se met à jour tout seul quand la photo est prête", async ({ page }) => {
  const prints = await mockPrints(page, [job("j1", "PRINTING")]);
  await openHome(page);
  await expect(requests(page)).toContainText("Impression en cours");

  prints.jobs = [job("j1", "DONE")];
  await page.clock.runFor(POLL_MS);

  await expect(requests(page)).toContainText(
    "Votre photo est prête, à récupérer près de l'imprimante"
  );
});

/**
 * Scenario: Problème d'impression
 *   Given mon job passe en STUCK ou FAILED
 *   Then je vois un message rassurant m'invitant à voir l'équipe
 *   And aucun terme technique n'est affiché
 */
for (const status of ["STUCK", "FAILED"] as const) {
  test(`problème (${status}) : message rassurant, sans jargon`, async ({ page }) => {
    const prints = await mockPrints(page, [job("j1", "PRINTING")]);
    await openHome(page);

    prints.jobs = [job("j1", status)];
    await page.clock.runFor(POLL_MS);

    await expect(requests(page)).toContainText(guestStatusLabel(status));
    await expect(requests(page)).toContainText("équipe");
    await expect(page.locator("body")).not.toContainText(RAW);
  });
}

test("chaque statut s'affiche en langage clair", async ({ page }) => {
  const all: PrintJobStatus[] = [
    "PENDING",
    "PRINTING",
    "DONE",
    "STUCK",
    "FAILED",
    "CANCELLED",
  ];
  await mockPrints(page, all.map((status, i) => job(`j${i}`, status)));
  await openHome(page);

  await expect(requests(page)).toHaveCount(all.length);
  for (let i = 0; i < all.length; i++) {
    const status = all[i];
    await expect(requests(page).nth(i)).toContainText(guestStatusLabel(status));
  }
  await expect(page.locator("body")).not.toContainText(RAW);
});

/**
 * Scenario: Imprimante hors ligne
 *   Given l'agent est hors ligne
 *   When j'ouvre l'écran de suivi
 *   Then je vois que l'imprimante n'est pas connectée pour le moment
 */
test("imprimante hors ligne : affichée sur l'écran de suivi", async ({ page }) => {
  await mockPrints(page, [job("j1", "PENDING")], { printerOnline: false });
  await openHome(page);

  await expect(tracking(page).getByTestId("printer-status")).toContainText(
    "L'imprimante n'est pas connectée pour le moment"
  );
});

test("après un rechargement, l'état est retrouvé", async ({ page }) => {
  await mockPrints(page, [job("j1", "DONE")]);
  await openHome(page);
  await expect(requests(page)).toHaveCount(1);

  await page.reload();

  await expect(requests(page)).toContainText(
    "Votre photo est prête, à récupérer près de l'imprimante"
  );
});

test("connexion perdue : dernier état connu, avec une mention claire", async ({
  page,
}) => {
  const prints = await mockPrints(page, [job("j1", "PRINTING")]);
  await openHome(page);
  await expect(requests(page)).toContainText("Impression en cours");

  prints.fail = true;
  // The Supabase client retries a failed read before giving up.
  await page.clock.runFor(POLL_MS + 40_000);

  await expect(tracking(page)).toContainText("Connexion perdue");
  await expect(requests(page)).toContainText("Impression en cours");

  prints.fail = false;
  prints.jobs = [job("j1", "DONE")];
  await page.clock.runFor(POLL_MS * 2);

  await expect(tracking(page)).not.toContainText("Connexion perdue");
  await expect(requests(page)).toContainText("prête");
});

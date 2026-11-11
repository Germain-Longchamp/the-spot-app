import { test, expect, Page } from "@playwright/test";
import type { PrintJobStatus } from "../lib/print/job-status";
import { json, mockGuestBackend, mockPhotoBackend } from "./support/guest-mocks";

const URL = "/e/jeton-de-test";
const RAW = /PENDING|PRINTING|DONE|STUCK|FAILED|CANCELLED/;

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

const tracking = (page: Page) => page.getByTestId("my-prints");

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

// The home list of requests moved to "Mes photos" (SCRUM-47), now the home banner and the gallery (SCRUM-63): live updates,
// problems, each status in plain words, offline printer, lost connection and
// reload are covered in e2e/my-photos.spec.ts.

import { test, expect, Page } from "@playwright/test";

const RPC = "**/rest/v1/rpc/create_print_job";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
};

async function answerWith(page: Page, result: string) {
  const calls: { p_idempotency_key: string }[] = [];
  await page.route(RPC, async (route) => {
    calls.push(route.request().postDataJSON());
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      status: 200,
      headers: cors,
      json: { result, job_id: "job-1" },
    });
  });
  return calls;
}

const button = (page: Page) => page.getByRole("button", { name: "Imprimer" });

test.beforeEach(async ({ page }) => {
  await page.route("**/rest/v1/rpc/get_printer_status", (route) =>
    route.fulfill({ status: 200, headers: cors, json: true })
  );
});

/**
 * Scenario: Demande valide
 *   Then je vois un message de confirmation
 */
test("confirmation en langage humain", async ({ page }) => {
  await answerWith(page, "created");
  await page.goto("/dev/print-button");
  await button(page).click();

  await expect(page.getByRole("status")).toContainText("C'est noté");
  await expect(page.locator("body")).not.toContainText("PENDING");
  await expect(button(page)).toBeDisabled();
});

/**
 * Scenario: Quota de l'événement atteint
 *   Then un message m'explique pourquoi
 */
test("quota de l'événement atteint : le message explique pourquoi", async ({
  page,
}) => {
  await answerWith(page, "print_limit_reached");
  await page.goto("/dev/print-button");
  await button(page).click();

  await expect(page.getByRole("status")).toContainText(
    "nombre maximum d'impressions de cet événement"
  );
});

/**
 * Scenario: Double appui
 *   When j'appuie deux fois rapidement sur "Imprimer"
 *   Then un seul job est créé
 */
test("double appui : une seule demande part", async ({ page }) => {
  const calls = await answerWith(page, "created");
  await page.goto("/dev/print-button");
  await button(page).dblclick();

  await expect(page.getByRole("status")).toContainText("C'est noté");
  expect(calls).toHaveLength(1);
});

/**
 * Scenario: Impression suspendue
 *   Then un message m'invite à patienter
 */
test("impressions suspendues : invitation à patienter", async ({ page }) => {
  await answerWith(page, "printing_paused");
  await page.goto("/dev/print-button");
  await button(page).click();

  await expect(page.getByRole("status")).toContainText("patienter");
  await expect(button(page)).toBeEnabled();
});

/** Cas limite : perte de réseau, le résultat doit rester clair. */
test("réseau coupé : réessai possible avec la même clé", async ({ page }) => {
  const keys: string[] = [];
  let online = false;
  await page.route(RPC, async (route) => {
    keys.push(route.request().postDataJSON().p_idempotency_key);
    if (!online) return route.abort("internetdisconnected");
    return route.fulfill({
      status: 200,
      headers: cors,
      json: { result: "created", job_id: "job-1" },
    });
  });
  await page.goto("/dev/print-button");

  await button(page).click();
  await expect(page.getByRole("status")).toContainText(
    "ne sera pas imprimée deux fois"
  );

  online = true;
  await page.reload();
  await button(page).click();
  await expect(page.getByRole("status")).toContainText("C'est noté");

  expect(new Set(keys).size).toBe(1);
});

test("erreur serveur : aucun détail technique affiché", async ({ page }) => {
  await page.route(RPC, (route) =>
    route.fulfill({
      status: 500,
      headers: cors,
      json: { message: "permission denied for function create_print_job" },
    })
  );
  await page.goto("/dev/print-button");
  await button(page).click();

  await expect(page.getByRole("status")).toContainText("Réessayez");
  await expect(page.locator("body")).not.toContainText("permission denied");
});

test("demande annulée par l'équipe : l'invité peut en refaire une", async ({
  page,
}) => {
  const keys: string[] = [];
  let result = "request_cancelled";
  await page.route(RPC, (route) => {
    keys.push(route.request().postDataJSON().p_idempotency_key);
    return route.fulfill({
      status: 200,
      headers: cors,
      json: { result, job_id: "job-1" },
    });
  });
  await page.goto("/dev/print-button");

  await button(page).click();
  await expect(page.getByRole("status")).toContainText("annulée par l'équipe");

  result = "created";
  await button(page).click();
  await expect(page.getByRole("status")).toContainText("C'est noté");

  expect(new Set(keys).size).toBe(2);
});

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
 * Scenario: Quota atteint
 *   Then un message m'explique pourquoi
 */
test("quota atteint : le message explique pourquoi", async ({ page }) => {
  await answerWith(page, "quota_reached");
  await page.goto("/dev/print-button");
  await button(page).click();

  await expect(page.getByRole("status")).toContainText(
    "utilisé toutes vos impressions"
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

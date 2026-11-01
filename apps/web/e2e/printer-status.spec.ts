import { test, expect, Page, Route } from "@playwright/test";

const RPC = "**/rest/v1/rpc/get_printer_status";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
};

const answer = (route: Route, online: boolean) =>
  route.fulfill({ status: 200, headers: cors, json: online });

const indicator = (page: Page) => page.getByTestId("printer-status");

const POLL_MS = 10_000;

/** Runs one polling round and waits for its request to go out. */
async function tick(page: Page, calls: () => number) {
  const before = calls();
  await page.clock.runFor(POLL_MS);
  await expect.poll(calls).toBeGreaterThan(before);
}

/**
 * Scenario: Agent en ligne
 *   Then je vois que l'imprimante est connectée
 */
test("imprimante connectée", async ({ page }) => {
  await page.route(RPC, (route) => answer(route, true));
  await page.goto("/dev/print-button");

  await expect(indicator(page)).toHaveText("L'imprimante est connectée");
  await expect(indicator(page).locator("span")).toHaveClass(/bg-success/);
});

/**
 * Scenario: Agent hors ligne
 *   Then je vois un message clair indiquant que l'imprimante n'est pas connectée
 */
test("imprimante hors ligne", async ({ page }) => {
  await page.route(RPC, (route) => answer(route, false));
  await page.goto("/dev/print-button");

  await expect(indicator(page)).toHaveText(
    "L'imprimante n'est pas connectée pour le moment"
  );
  await expect(indicator(page).locator("span")).toHaveClass(/bg-danger/);
});

test("l'indicateur est visible dès l'écran d'impression", async ({ page }) => {
  await page.route(RPC, (route) => answer(route, true));
  await page.goto("/dev/print-button");

  await expect(indicator(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimer" })).toBeVisible();
});

/**
 * Scenario: Retour en ligne
 *   Then l'indicateur repasse en ligne sans recharger la page
 */
test("retour en ligne sans recharger la page", async ({ page }) => {
  let online = false;
  await page.route(RPC, (route) => answer(route, online));
  await page.clock.install();
  await page.goto("/dev/print-button");
  await expect(indicator(page)).toHaveAttribute("data-state", "offline");

  online = true;
  await page.clock.runFor(POLL_MS);

  await expect(indicator(page)).toHaveAttribute("data-state", "online");
});

test("la coupure apparaît aussi sans recharger la page", async ({ page }) => {
  let online = true;
  await page.route(RPC, (route) => answer(route, online));
  await page.clock.install();
  await page.goto("/dev/print-button");
  await expect(indicator(page)).toHaveAttribute("data-state", "online");

  online = false;
  await page.clock.runFor(POLL_MS);

  await expect(indicator(page)).toHaveAttribute("data-state", "offline");
});

/** Cas limite : un retard bref ne doit pas faire clignoter l'indicateur. */
test("une vérification ratée ne fait pas clignoter l'indicateur", async ({
  page,
}) => {
  let failing = false;
  let calls = 0;
  await page.route(RPC, (route) => {
    calls++;
    return failing
      ? route.fulfill({ status: 500, headers: cors, json: { message: "x" } })
      : answer(route, true);
  });
  await page.clock.install();
  await page.goto("/dev/print-button");
  await expect(indicator(page)).toHaveAttribute("data-state", "online");

  failing = true;
  await tick(page, () => calls);

  await expect(indicator(page)).toHaveAttribute("data-state", "online");
});

test("sans réponse répétée, l'invité le sait", async ({ page }) => {
  let calls = 0;
  await page.route(RPC, (route) => {
    calls++;
    return route.abort("internetdisconnected");
  });
  await page.clock.install();
  await page.goto("/dev/print-button");
  await expect.poll(() => calls).toBeGreaterThan(0);

  for (let i = 0; i < 3; i++) {
    await tick(page, () => calls);
  }

  await expect(indicator(page)).toHaveText(
    "Impossible de vérifier l'imprimante pour le moment"
  );
});

test("aucun statut brut ni terme technique", async ({ page }) => {
  await page.route(RPC, (route) => answer(route, false));
  await page.goto("/dev/print-button");

  await expect(indicator(page)).toHaveAttribute("data-state", "offline");
  await expect(page.locator("body")).not.toContainText(/agent|heartbeat|STUCK/i);
});

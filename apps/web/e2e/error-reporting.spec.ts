import { test, expect, Page } from "@playwright/test";
import { json, mockGuestBackend } from "./support/guest-mocks";
import { MAX_REPORTS_PER_PAGE, sanitize } from "../lib/errors/sanitize";
import { formatErrors } from "../scripts/errors-lib.mjs";

const TOKEN = "jeton-de-test-tres-long-et-secret-123456";

async function captureReports(page: Page) {
  const reports: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/rpc/log_app_error", (route) => {
    reports.push(route.request().postDataJSON());
    return json(route, null);
  });
  return reports;
}

async function openHome(page: Page) {
  await mockGuestBackend(page);
  await page.route("**/rest/v1/photos?**", (route) => json(route, []));
  await page.route("**/rest/v1/print_jobs?**", (route) => json(route, []));
  await page.goto(`/e/${TOKEN}`);
  await expect(page.getByRole("button", { name: "Prendre une photo" })).toBeVisible();
}

/**
 * Scenario: Erreur côté application
 *   Given une erreur survient dans l'application d'un invité
 *   Then elle est enregistrée avec l'écran et le navigateur concernés
 */
test("une erreur non gérée est envoyée avec l'écran et le navigateur, sans le lien secret", async ({
  page,
}) => {
  const reports = await captureReports(page);
  await openHome(page);

  await page.evaluate((token) => {
    setTimeout(() => {
      throw new Error(`Plantage sur /e/${token}/galerie`);
    });
  }, TOKEN);

  await expect.poll(() => reports.length).toBe(1);
  const report = reports[0];
  expect(report.p_screen).toBe("/e/[lien]");
  expect(String(report.p_browser)).toContain("Mozilla");
  expect(String(report.p_message)).toContain("Plantage sur /e/[lien]/galerie");
  expect(JSON.stringify(report)).not.toContain(TOKEN);
  expect(report.p_event_id).toBe("22222222-2222-4222-8222-222222222222");
});

test("une promesse rejetée sans traitement est aussi signalée", async ({ page }) => {
  const reports = await captureReports(page);
  await openHome(page);

  await page.evaluate(() => {
    Promise.reject(new Error("Rejet oublié"));
  });

  await expect.poll(() => reports.length).toBe(1);
  expect(reports[0].p_message).toContain("Rejet oublié");
});

test(`pas plus de ${MAX_REPORTS_PER_PAGE} signalements par page`, async ({ page }) => {
  const reports = await captureReports(page);
  await openHome(page);

  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        throw new Error(`boucle ${i}`);
      });
    }
  });

  await page.waitForTimeout(1500);
  expect(reports).toHaveLength(MAX_REPORTS_PER_PAGE);
});

test("connexion anonyme refusée : la cause précise est signalée", async ({ page }) => {
  const reports = await captureReports(page);
  await page.route("**/rest/v1/rpc/get_event_entry", (route) => json(route, "open"));
  await page.route("**/auth/v1/signup", (route) =>
    // The shape Supabase really sends (seen in the logs on 2026-11-04).
    json(route, { code: 422, error_code: "anonymous_provider_disabled", msg: "Anonymous sign-ins are disabled" }, 422)
  );
  await page.goto(`/e/${TOKEN}`);

  await expect(page.getByText("Nous n'arrivons pas à ouvrir l'événement")).toBeVisible();
  await expect.poll(() => reports.length).toBeGreaterThanOrEqual(1);
  expect(String(reports[0].p_message)).toContain("anonymous_provider_disabled");
});

test("le signalement ne gêne jamais l'invité, même hors réseau", async ({ page }) => {
  await page.route("**/rest/v1/rpc/log_app_error", (route) => route.abort("internetdisconnected"));
  await openHome(page);

  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("hors réseau");
    });
  });

  await expect(page.getByRole("button", { name: "Prendre une photo" })).toBeEnabled();
});

/**
 * Scenario: Données personnelles
 *   Then ils ne contiennent aucune photo ni information personnelle
 */
test("liens et identifiants longs sont masqués avant envoi", () => {
  expect(sanitize("GET /operateur/lien0factice1pour2le3test4masquage5abc failed")).toBe(
    "GET /operateur/[lien] failed"
  );
  expect(sanitize("photo 00000000-0000-4000-8000-000000000123/abcdefghijklmnopqrstuvwxyz0123.jpg")).not.toContain(
    "abcdefghijklmnopqrstuvwxyz0123"
  );
  expect(sanitize("Token faux0jeton1de2test3pour4masquage refusé")).toBe("Token [masqué] refusé");
  expect(sanitize("anonymous_provider_disabled")).toBe("anonymous_provider_disabled");
  expect(sanitize("mot ".repeat(300))).toHaveLength(500);
});

/**
 * Scenario: Retrouver une panne
 *   When je consulte les journaux
 *   Then je retrouve la séquence d'événements autour de l'incident
 */
test("le script de consultation lit la séquence dans l'ordre, une ligne par erreur", () => {
  const text = formatErrors(
    [
      { created_at: "2026-11-07T13:00:01Z", source: "web", screen: "/e/[lien]", message: "Connexion anonyme refusée" },
      { created_at: "2026-11-07T13:00:05Z", source: "agent", job_id: "j1", message: "impression en échec : Papier épuisé" },
    ],
    60
  );

  const lines = text.split("\n");
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain("web /e/[lien]");
  expect(lines[1]).toContain("agent job j1");
  expect(lines[1]).toContain("Papier épuisé");
  expect(formatErrors([], 30)).toBe("Aucune erreur sur les 30 dernières minutes.");
});

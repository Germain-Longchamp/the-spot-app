import { test, expect } from "@playwright/test";

/**
 * Scenario: Démarrage local
 *   Given j'ai cloné le dépôt et renseigné mes variables d'environnement
 *   When je lance l'application en local
 *   Then la page d'accueil s'affiche
 */
test("la page d'accueil s'affiche", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  expect(html).toContain("The Spot");
});

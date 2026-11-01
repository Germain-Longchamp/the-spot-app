import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

const repoRoot = path.resolve(__dirname, "../../..");
const workflow = readFileSync(
  path.join(repoRoot, ".github/workflows/ci.yml"),
  "utf-8"
);

/**
 * Scenario: Modification valide
 *   Given je propose une modification qui respecte les règles
 *   When les vérifications automatiques s'exécutent
 *   Then elles réussissent et la fusion est autorisée
 *
 * Ce test garde le contrat du workflow. Le comportement réel (échec bloquant,
 * test nommé dans le rapport) a été constaté sur GitHub Actions : voir la PR.
 */
test("le workflow lance chaque vérification à chaque modification", () => {
  expect(workflow).toMatch(/^on:\n  push:\n/m);

  for (const step of [
    "npm run lint",
    "npm run type-check",
    "npm run build",
    "npm test",
  ]) {
    expect(workflow, `étape manquante : ${step}`).toContain(`- run: ${step}`);
  }
});

/**
 * Scenario: Test en échec
 *   Given une modification casse un test
 *   When les vérifications s'exécutent
 *   Then la fusion est bloquée
 */
test("aucune vérification ne peut échouer sans bloquer", () => {
  expect(workflow).not.toContain("continue-on-error");
});

test("les tests instables ne sont pas masqués par des relances", async () => {
  const { default: config } = await import("../playwright.config");
  expect(config.retries ?? 0).toBe(0);
});

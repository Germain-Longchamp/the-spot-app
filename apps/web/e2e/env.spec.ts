import { test, expect } from "@playwright/test";
import { validateRequiredEnv } from "../lib/validate-env";

/**
 * Scenario: Variable d'environnement manquante
 *   When une variable requise est absente
 *   Then un message d'erreur explicite s'affiche au démarrage
 */
test("variable manquante → message d'erreur explicite", () => {
  expect(() =>
    validateRequiredEnv({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "present",
    })
  ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);

  expect(() =>
    validateRequiredEnv({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    })
  ).toThrow(/Variables d'environnement manquantes/);
});

test("toutes les variables présentes → pas d'erreur", () => {
  expect(() =>
    validateRequiredEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-key",
    })
  ).not.toThrow();
});

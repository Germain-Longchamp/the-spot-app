import { test, expect, Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OperatorAction, runOperatorAction } from "../lib/operator/actions";

const PANEL = "/dev/operator-panel";
const settings = (page: Page) => page.getByRole("region", { name: "Paramètres" });

async function openSettings(page: Page, query = "") {
  await page.goto(`${PANEL}${query}`);
  await page.getByRole("tab", { name: "Paramètres" }).click();
}
const status = (page: Page) => page.locator("main > p[role=status]");

test.describe("panneau opérateur", () => {
  test("ouvrir puis cacher la galerie", async ({ page }) => {
    await openSettings(page);
    await expect(page.getByTestId("gallery-state")).toContainText("Galerie cachée");

    await settings(page).getByRole("button", { name: "Ouvrir la galerie aux invités" }).click();
    await expect(page.getByTestId("gallery-state")).toContainText("Galerie ouverte");

    await settings(page).getByRole("button", { name: "Cacher la galerie" }).click();
    await expect(page.getByTestId("gallery-state")).toContainText("Galerie cachée");
  });

  test("désactiver la galerie retire l'option d'ouverture", async ({ page }) => {
    await openSettings(page, "?gallery");

    await settings(page).getByRole("button", { name: "Désactiver la galerie" }).click();

    await expect(page.getByTestId("gallery-state")).toContainText("Pas de galerie");
    await expect(
      settings(page).getByRole("button", { name: "Ouvrir la galerie aux invités" })
    ).toHaveCount(0);
  });

  test("enregistrer une limite, puis la retirer", async ({ page }) => {
    await openSettings(page);

    await page.getByLabel("Nombre maximal d'impressions").fill("40");
    await page.getByRole("button", { name: "Enregistrer la limite" }).click();
    await expect(status(page)).toHaveText("Action de test : print_limit 40");

    await page.getByLabel("Nombre maximal d'impressions").fill("");
    await page.getByRole("button", { name: "Enregistrer la limite" }).click();
    await expect(status(page)).toHaveText("Action de test : print_limit null");
  });

  test("une limite invalide est refusée avec une explication", async ({ page }) => {
    await openSettings(page);

    await page.getByLabel("Nombre maximal d'impressions").fill("-3");
    await page.getByRole("button", { name: "Enregistrer la limite" }).click();

    await expect(settings(page).getByRole("alert")).toContainText("nombre entier");
    await expect(status(page)).toHaveText("");
  });

  test("fermer l'événement demande confirmation, puis le panneau le signale", async ({ page }) => {
    await openSettings(page);

    await settings(page).getByRole("button", { name: "Fermer l'événement…" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Confirmer la fermeture" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Laisser ouvert" }).click();
    await expect(page.getByText("Événement fermé")).toHaveCount(0);

    await settings(page).getByRole("button", { name: "Fermer l'événement…" }).click();
    await page
      .getByRole("alertdialog", { name: "Confirmer la fermeture" })
      .getByRole("button", { name: "Fermer l'événement" })
      .click();

    await expect(page.getByText("Événement fermé : les invités ne peuvent plus")).toBeVisible();
    await settings(page).getByRole("button", { name: "Rouvrir l'événement" }).click();
    await expect(page.getByText("Événement fermé")).toHaveCount(0);
  });
});

test.describe("action serveur", () => {
  const clientAnswering = (data: unknown) => {
    const calls: { fn: string; args: unknown }[] = [];
    const client = {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return { data, error: null };
      },
    };
    return { client: client as unknown as SupabaseClient, calls };
  };

  const cases: [OperatorAction, string, unknown, string][] = [
    [
      { type: "gallery", enabled: true, visible: true },
      "set_gallery",
      { p_event_id: "e1", p_enabled: true, p_visible: true },
      "galerie",
    ],
    [
      { type: "print_limit", limit: 40 },
      "set_print_limit",
      { p_event_id: "e1", p_limit: 40 },
      "limite",
    ],
    [
      { type: "print_limit", limit: null },
      "set_print_limit",
      { p_event_id: "e1", p_limit: null },
      "limite",
    ],
    [{ type: "close" }, "set_event_open", { p_event_id: "e1", p_open: false }, "fermé"],
    [{ type: "reopen" }, "set_event_open", { p_event_id: "e1", p_open: true }, "rouvert"],
  ];

  for (const [action, fn, args, word] of cases) {
    test(`${JSON.stringify(action)} appelle ${fn} et confirme en clair`, async () => {
      const { client, calls } = clientAnswering({ result: "applied" });

      const message = await runOperatorAction(client, "e1", action);

      expect(calls).toEqual([{ fn, args }]);
      expect(message).toContain(word);
    });
  }

  test("une valeur refusée par la base est expliquée simplement", async () => {
    const { client } = clientAnswering({ result: "invalid" });

    expect(
      await runOperatorAction(client, "e1", { type: "print_limit", limit: -1 })
    ).toContain("pas valable");
  });
});

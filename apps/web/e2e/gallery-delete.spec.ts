import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runOperatorAction } from "../lib/operator/actions";

const PANEL = "/dev/operator-panel";
type Page = import("@playwright/test").Page;
const photos = (page: Page) => page.getByTestId("gallery-photo");

async function openGallery(page: Page, query = "") {
  await page.goto(`${PANEL}${query}`);
  await page.getByRole("tab", { name: /Galerie/ }).click();
}

test.describe("panneau opérateur", () => {
  test("les photos publiées sont listées avec un bouton « Supprimer »", async ({ page }) => {
    await openGallery(page);

    await expect(page.getByRole("heading", { name: "Galerie", exact: true })).toBeVisible();
    await expect(photos(page)).toHaveCount(2);
    await expect(photos(page).first().getByRole("button", { name: "Supprimer" })).toBeVisible();
  });

  /**
   * Scenario: Suppression par l'administrateur
   *   When je supprime une photo après confirmation
   */
  test("rien n'est supprimé sans confirmation explicite", async ({ page }) => {
    await openGallery(page);

    await photos(page).first().getByRole("button", { name: "Supprimer" }).click();

    const dialog = page.getByRole("alertdialog", { name: "Confirmer la suppression" });
    await expect(dialog).toContainText("Supprimer définitivement cette photo ?");
    await expect(photos(page)).toHaveCount(2);

    await dialog.getByRole("button", { name: "Supprimer définitivement" }).click();

    await expect(photos(page)).toHaveCount(1);
    await expect(page.getByRole("status")).toContainText("delete_photo photo-a");
  });

  /**
   * Scenario: Annulation
   *   When j'annule la confirmation
   *   Then la photo reste en place
   */
  test("annuler la confirmation garde la photo", async ({ page }) => {
    await openGallery(page);

    await photos(page).first().getByRole("button", { name: "Supprimer" }).click();
    await page.getByRole("button", { name: "Garder la photo" }).click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(photos(page)).toHaveCount(2);
  });

  test("galerie vide : message simple", async ({ page }) => {
    await openGallery(page, "?empty");

    await expect(page.getByText("Aucune photo publiée pour le moment.")).toBeVisible();
  });
});

test.describe("action serveur", () => {
  function client(answer: { data: unknown; error?: unknown }, removeError: unknown = null) {
    const calls = { rpc: [] as unknown[], removed: [] as string[][] };
    const fake = {
      rpc: async (fn: string, args: unknown) => {
        calls.rpc.push({ fn, args });
        return { data: answer.data, error: answer.error ?? null };
      },
      storage: {
        from: (bucket: string) => {
          expect(bucket).toBe("photos");
          return {
            remove: async (paths: string[]) => {
              calls.removed.push(paths);
              return { data: [], error: removeError };
            },
          };
        },
      },
    };
    return { client: fake as unknown as SupabaseClient, calls };
  }

  const del = { type: "delete_photo", photoId: "p1" } as const;
  const paths = ["e1/g1/p1.jpg", "e1/g1/p1-thumb.jpg"];

  test("supprime d'abord en base, puis les fichiers", async () => {
    const { client: c, calls } = client({ data: { result: "applied", paths } });

    const message = await runOperatorAction(c, "e1", del);

    expect(calls.rpc).toEqual([
      { fn: "operator_delete_photo", args: { p_event_id: "e1", p_photo_id: "p1" } },
    ]);
    expect(calls.removed).toEqual([paths]);
    expect(message).toContain("disparu de la galerie");
  });

  test("déjà supprimée : message clair, et les fichiers restants sont effacés", async () => {
    const { client: c, calls } = client({ data: { result: "already_deleted", paths } });

    const message = await runOperatorAction(c, "e1", del);

    expect(message).toContain("n'existe plus");
    expect(calls.removed).toEqual([paths]);
  });

  test("impression en cours : rien n'est effacé, l'équipe sait quoi faire", async () => {
    const { client: c, calls } = client({ data: { result: "print_in_progress" } });

    const message = await runOperatorAction(c, "e1", del);

    expect(message).toContain("Annulez-la");
    expect(calls.removed).toEqual([]);
  });

  test("fichier non effacé : l'équipe peut finir d'un nouvel appui", async () => {
    const { client: c } = client(
      { data: { result: "applied", paths } },
      { message: "storage down" }
    );

    const message = await runOperatorAction(c, "e1", del);

    expect(message).toContain("Touchez de nouveau");
    expect(message).not.toContain("storage");
  });

  test("panne : aucun détail technique", async () => {
    const { client: c } = client({ data: null, error: { message: "permission denied" } });

    const message = await runOperatorAction(c, "e1", del);

    expect(message).toContain("Réessayez");
    expect(message).not.toContain("permission");
  });
});

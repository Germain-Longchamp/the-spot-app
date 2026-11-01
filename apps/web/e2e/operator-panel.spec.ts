import { test, expect, Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findEventForToken, hashOperatorToken } from "../lib/operator/access";
import { OperatorAction, runOperatorAction } from "../lib/operator/actions";
import { PanelJob, panelCounts, sortJobs } from "../lib/operator/panel";

const jobs = (page: Page) => page.getByTestId("job");

test.describe("écran", () => {
  test("le panneau montre le suivi de l'activité", async ({ page }) => {
    await page.goto("/dev/operator-panel?limit=10");

    await expect(page.getByTestId("printer-status")).toHaveAttribute(
      "data-state",
      "online"
    );
    await expect(page.getByText("En attente", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("5 / 10")).toBeVisible();
    await expect(jobs(page)).toHaveCount(6);
  });

  test("sans quota, seul le nombre de demandes s'affiche", async ({ page }) => {
    await page.goto("/dev/operator-panel");

    await expect(page.getByText(" / ")).toHaveCount(0);
  });

  test("les problèmes passent avant la file, l'historique à la fin", async ({
    page,
  }) => {
    await page.goto("/dev/operator-panel");

    await expect(jobs(page).first()).toContainText("Échec");
    await expect(jobs(page).last()).toContainText("Imprimée");
  });

  test("chaque demande propose seulement ce qui est possible", async ({
    page,
  }) => {
    await page.goto("/dev/operator-panel");
    const pending = jobs(page).filter({ hasText: "En attente" }).first();
    const failed = jobs(page).filter({ hasText: "Échec" });
    const done = jobs(page).filter({ hasText: "Imprimée" });

    await expect(pending.getByRole("button", { name: "Lancer" })).toBeVisible();
    await expect(pending.getByRole("button", { name: "Annuler" })).toBeVisible();
    await expect(
      failed.getByRole("button", { name: "Réessayer" })
    ).toBeVisible();
    await expect(failed).toContainText("Papier épuisé");
    await expect(done.getByRole("button")).toHaveCount(0);
  });

  test("une action affiche sa réponse", async ({ page }) => {
    await page.goto("/dev/operator-panel");

    await page.getByRole("button", { name: "Lancer" }).first().click();

    await expect(page.getByRole("status")).toContainText("start");
  });

  test("la pause est bien visible, et réversible", async ({ page }) => {
    await page.goto("/dev/operator-panel");

    await page.getByRole("button", { name: "Mettre en pause" }).click();
    await expect(page.getByText("Impressions en pause")).toBeVisible();

    await page.getByRole("button", { name: "Reprendre les impressions" }).click();
    await expect(page.getByText("Impressions en pause")).toHaveCount(0);
  });

  test("imprimante hors ligne : c'est visible", async ({ page }) => {
    await page.goto("/dev/operator-panel?offline");

    await expect(page.getByTestId("printer-status")).toHaveAttribute(
      "data-state",
      "offline"
    );
  });

  test("aucun statut brut à l'écran", async ({ page }) => {
    await page.goto("/dev/operator-panel");
    await expect(jobs(page).first()).toBeVisible();

    await expect(page.locator("body")).not.toContainText(
      /PENDING|PRINTING|STUCK|FAILED|DONE|CANCELLED/
    );
  });

  test("le panneau reste utilisable sur tablette et téléphone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/dev/operator-panel");
    await expect(jobs(page).first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
  });
});

test.describe("accès", () => {
  /**
   * Scenario: Accès non autorisé
   *   When une personne sans accès ouvre le panneau opérateur
   *   Then l'accès est refusé
   */
  test("un lien inconnu n'ouvre rien", async ({ request }) => {
    const response = await request.get("/operateur/lien-inconnu");

    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("Mettre en pause");
  });

  test("le lien n'est ni indexé, ni mis en cache, ni transmis", async ({
    request,
  }) => {
    const { headers } = await request.get("/operateur/lien-inconnu").then((r) => ({
      headers: r.headers(),
    }));

    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["cache-control"]).toContain("no-store");
  });

  const clientFinding = (row: unknown, error: unknown = null) => {
    const seen: string[] = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: (_: string, value: string) => {
            seen.push(value);
            return { maybeSingle: async () => ({ data: row, error }) };
          },
        }),
      }),
    };
    return { client: client as unknown as SupabaseClient, seen };
  };

  test("seul le hash du lien part vers la base", async () => {
    const { client, seen } = clientFinding({ event_id: "e1" });

    expect(await findEventForToken(client, "secret")).toBe("e1");
    expect(seen).toEqual([hashOperatorToken("secret")]);
    expect(seen[0]).not.toContain("secret");
  });

  test("toute panne refuse l'accès", async () => {
    const failing = clientFinding(null, { message: "panne" }).client;
    const throwing = {
      from: () => {
        throw new Error("réseau");
      },
    } as unknown as SupabaseClient;

    expect(await findEventForToken(failing, "secret")).toBeNull();
    expect(await findEventForToken(throwing, "secret")).toBeNull();
    expect(await findEventForToken(clientFinding(null).client, "x")).toBeNull();
  });
});

test.describe("actions", () => {
  const clientAnswering = (data: unknown, error: unknown = null) => {
    const calls: { fn: string; args: unknown }[] = [];
    const client = {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return { data, error };
      },
    };
    return { client: client as unknown as SupabaseClient, calls };
  };

  const cases: [OperatorAction, string, unknown][] = [
    [
      { type: "start", jobId: "j1" },
      "start_print_job",
      { p_event_id: "e1", p_job_id: "j1" },
    ],
    [
      { type: "retry", jobId: "j1" },
      "operator_job_action",
      { p_event_id: "e1", p_job_id: "j1", p_action: "retry" },
    ],
    [
      { type: "cancel", jobId: "j1" },
      "operator_job_action",
      { p_event_id: "e1", p_job_id: "j1", p_action: "cancel" },
    ],
    [
      { type: "pause" },
      "set_printing_paused",
      { p_event_id: "e1", p_paused: true },
    ],
    [
      { type: "resume" },
      "set_printing_paused",
      { p_event_id: "e1", p_paused: false },
    ],
  ];

  for (const [action, fn, args] of cases) {
    test(`${action.type} appelle la bonne fonction de l'événement`, async () => {
      const { client, calls } = clientAnswering({ result: "applied" });

      await runOperatorAction(client, "e1", action);

      expect(calls).toEqual([{ fn, args }]);
    });
  }

  test("un refus donne un message clair", async () => {
    const start: OperatorAction = { type: "start", jobId: "j1" };
    const say = async (result: string) =>
      runOperatorAction(clientAnswering({ result }).client, "e1", start);

    expect(await say("started")).toBe("Impression lancée.");
    expect(await say("busy")).toContain("déjà en cours");
    expect(await say("agent_offline")).toContain("pas connectée");
    expect(await say("paused")).toContain("en pause");
  });

  test("une panne ne montre aucun détail technique", async () => {
    const { client } = clientAnswering(null, { message: "permission denied" });

    const message = await runOperatorAction(client, "e1", {
      type: "pause",
    });

    expect(message).toContain("Réessayez");
    expect(message).not.toContain("permission");
  });
});

test.describe("données", () => {
  const job = (id: string, status: PanelJob["status"], minute: number) => ({
    id,
    status,
    authorized: false,
    createdAt: `2026-11-01T10:0${minute}:00Z`,
    lastError: null,
    photoUrl: null,
  });

  test("la file est servie dans l'ordre d'arrivée", () => {
    const sorted = sortJobs([
      job("b", "PENDING", 2),
      job("a", "PENDING", 1),
      job("old", "DONE", 1),
      job("new", "DONE", 2),
      job("now", "PRINTING", 3),
    ]);

    expect(sorted.map((j) => j.id)).toEqual(["now", "a", "b", "new", "old"]);
  });

  test("les demandes annulées ne comptent pas dans le quota", () => {
    const counts = panelCounts([
      job("a", "PENDING", 1),
      job("b", "CANCELLED", 2),
      job("c", "STUCK", 3),
      job("d", "FAILED", 4),
      job("e", "DONE", 5),
    ]);

    expect(counts).toMatchObject({
      waiting: 1,
      problems: 2,
      done: 1,
      used: 4,
    });
  });
});

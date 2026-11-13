import { randomUUID } from "crypto";
import { test, expect, Page } from "@playwright/test";
import { fakeJob, mockAlbum } from "./support/album-mocks";
import { json, mockGuestBackend, mockPhotoBackend } from "./support/guest-mocks";
import { stripes } from "./support/images";
import { TestDb } from "./support/test-db";

// SCRUM-61 — The guest writes the two lines of the band of their print: line
// 1 starts with the event's frame text, line 2 is free. 30 characters a line,
// checked by the server; no emojis. The team sees the text before printing.

test.describe("base de données", () => {
  let db: TestDb;
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    db = await TestDb.start();
  });
  test.afterAll(async () => {
    await db?.stop();
  });

  const ask = (userId: string, photoId: string, line1: string | null, line2: string | null, key = randomUUID()) =>
    db.as("authenticated", userId, async (client) => {
      const { rows } = await client.query(
        "select public.create_print_job(p_photo_id => $1, p_idempotency_key => $2, p_frame_line1 => $3, p_frame_line2 => $4) as r",
        [photoId, key, line1, line2]
      );
      return rows[0].r as { result: string; job_id?: string };
    });
  const linesOf = async (jobId: string) =>
    (await db.admin.query("select frame_line1, frame_line2 from public.print_jobs where id = $1", [jobId]))
      .rows[0];

  /**
   * Scenario: Texte imprimé
   *   Given j'ai écrit "Tonton Michel en feu" en ligne 1
   *   When mon tirage est imprimé
   *   Then l'image envoyée à print() porte ce texte
   */
  test("les deux lignes sont gardées avec la demande, et envoyées à l'agent", async () => {
    const f = await db.seed({ limit: 5 });
    const answer = await ask(f.userId, f.photoId, "  Tonton Michel en feu ", "14 juin 2027");
    expect(answer.result).toBe("created");
    expect(await linesOf(answer.job_id!)).toEqual({
      frame_line1: "Tonton Michel en feu",
      frame_line2: "14 juin 2027",
    });

    await db.admin.query("update public.print_jobs set authorized_at = now() where id = $1", [answer.job_id]);
    const claimed = await db.service<Record<string, unknown>>("claim_print_job", f.eventId, "agent-test");
    expect(claimed.frame).toEqual({ line1: "Tonton Michel en feu", line2: "14 juin 2027" });
  });

  /**
   * Scenario: Ligne 1 vidée
   *   Given je vide la ligne 1
   *   When j'imprime
   *   Then le tirage porte le texte du cadre de l'événement
   */
  test("ligne 1 vidée : le texte du cadre de l'événement ; ligne 2 vide : rien", async () => {
    const f = await db.seed({ limit: 5 });
    await db.admin.query("update public.events set frame_title = 'Camille & Hugo' where id = $1", [f.eventId]);
    const answer = await ask(f.userId, f.photoId, "   ", "");
    expect(await linesOf(answer.job_id!)).toEqual({ frame_line1: "Camille & Hugo", frame_line2: null });
  });

  /**
   * Scenario: Contrôle serveur
   *   When une demande arrive avec une ligne de 31 caractères
   *   Then elle est refusée
   */
  for (const [which, line1, line2] of [
    ["ligne 1", "x".repeat(31), ""],
    ["ligne 2", "ok", "x".repeat(31)],
  ] as const) {
    test(`${which} de 31 caractères : refusée, aucune demande`, async () => {
      const f = await db.seed({ limit: 5 });
      expect(await ask(f.userId, f.photoId, line1, line2)).toEqual({ result: "invalid_frame_text" });
      expect(await db.jobCount(f.guestId)).toBe(0);
    });
  }

  test("30 caractères, accents compris : acceptés", async () => {
    const f = await db.seed({ limit: 5 });
    const thirty = "é".repeat(30);
    expect((await ask(f.userId, f.photoId, thirty, thirty)).result).toBe("created");
  });

  test("même demande rejouée : même tirage, textes inchangés", async () => {
    const f = await db.seed({ limit: 5 });
    const key = randomUUID();
    const first = await ask(f.userId, f.photoId, "Premier", null, key);
    const again = await ask(f.userId, f.photoId, "Autre", null, key);
    expect(again).toEqual(first);
    expect((await linesOf(first.job_id!)).frame_line1).toBe("Premier");
    expect(await db.jobCount(f.guestId)).toBe(1);
  });

  test("l'ancienne demande à deux arguments marche toujours (galerie, Vos tirages)", async () => {
    const f = await db.seed({ limit: 5 });
    await db.admin.query("update public.events set frame_title = 'Camille & Hugo' where id = $1", [f.eventId]);
    // Named arguments, as PostgREST calls it: only one candidate each time.
    const answer = await db.as("authenticated", f.userId, async (client) => {
      const { rows } = await client.query(
        "select public.create_print_job(p_photo_id => $1, p_idempotency_key => $2) as r",
        [f.photoId, randomUUID()]
      );
      return rows[0].r as { result: string; job_id: string };
    });
    expect(answer.result).toBe("created");
    expect(await linesOf(answer.job_id)).toEqual({ frame_line1: "Camille & Hugo", frame_line2: null });
  });

  test("un anonyme ne peut pas demander d'impression avec texte", async () => {
    const f = await db.seed({ limit: 5 });
    await expect(
      db.as("anon", null, (client) =>
        client.query("select public.create_print_job($1, $2, 'x', 'y')", [f.photoId, randomUUID()])
      )
    ).rejects.toThrow(/permission denied/);
  });

  test("la photo d'un autre invité : même réponse qu'une photo absente", async () => {
    const f = await db.seed({ limit: 5 });
    const other = await db.seedGuest(f.eventId);
    expect(await ask(other.userId, f.photoId, "Pirate", null)).toEqual({ result: "photo_not_found" });
  });

  /**
   * Règle : le texte est supprimé avec la photo.
   */
  test("photo retirée par l'équipe : les textes de ses tirages partent avec elle", async () => {
    const f = await db.seed({ limit: 5 });
    const answer = await ask(f.userId, f.photoId, "Tonton Michel", "en feu");
    await db.service("transition_print_job", answer.job_id, "CANCELLED", "operator", 1, null, null);

    const removed = await db.service<{ result: string }>("operator_delete_photo", f.eventId, f.photoId);
    expect(removed.result).toBe("applied");
    expect(await linesOf(answer.job_id!)).toEqual({ frame_line1: null, frame_line2: null });
  });
});

test.describe("écran « Votre photo »", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function openReview(page: Page, frameTitle = "Camille & Hugo") {
    await mockGuestBackend(page, {
      event: { name: "Mariage Camille et Hugo", frame_title: frameTitle, gallery_enabled: true, gallery_visible: true },
    });
    const calls = await mockPhotoBackend(page);
    await page.goto("/e/jeton-de-test");
    await page.getByRole("button", { name: "Importer une photo" }).waitFor();
    await page.getByLabel("Choisir une photo").setInputFiles({
      name: "p.png",
      mimeType: "image/png",
      buffer: await stripes(800, 1000, [[200, 120, 90]]),
    });
    await expect(page.getByTestId("print-photo")).toBeVisible();
    return calls;
  }
  const line1 = (page: Page) => page.getByLabel("Votre petit mot");
  const line2 = (page: Page) => page.getByLabel("Deuxième ligne (facultative)");
  const printed = (page: Page, n: 1 | 2) => page.getByTestId("print-page").first().getByTestId(`print-line${n}`);

  /**
   * Scenario: Préremplissage
   *   Given l'événement "Camille & Hugo"
   *   When j'arrive sur l'écran de personnalisation
   *   Then la ligne 1 contient "Camille & Hugo" et la ligne 2 est vide
   */
  test("préremplissage : ligne 1 = texte du cadre, ligne 2 vide", async ({ page }) => {
    await openReview(page);
    await expect(page.getByTestId("frame-text-edit")).toContainText("Camille & Hugo");
    await page.getByTestId("frame-text-edit").click();
    await expect(line1(page)).toHaveValue("Camille & Hugo");
    await expect(line2(page)).toHaveValue("");
    await expect(page.getByText("Il vous aidera aussi à reconnaître votre tirage à l'imprimante.")).toBeVisible();
  });

  /**
   * Scenario: Aperçu en direct
   *   When je remplace la ligne 1 par "Les copines du lycée"
   *   Then l'aperçu du cadre affiche "Les copines du lycée"
   * Scenario: Ligne 2 libre
   *   When je tape "14 juin 2027" dans la ligne 2
   *   Then l'aperçu l'affiche sous la ligne 1
   */
  test("aperçu en direct, ligne 2 sous la ligne 1, puis retour à l'écran", async ({ page }) => {
    await openReview(page);
    await page.getByTestId("frame-text-edit").click();

    await line1(page).fill("Les copines du lycée");
    await expect(printed(page, 1)).toHaveText("Les copines du lycée");
    await line2(page).fill("14 juin 2027");
    await expect(printed(page, 2)).toHaveText("14 JUIN 2027");
    const one = (await printed(page, 1).boundingBox())!;
    const two = (await printed(page, 2).boundingBox())!;
    expect(two.y).toBeGreaterThan(one.y);
    // Counters.
    await expect(page.getByTestId("frame-text-editor")).toContainText("20/30");
    await expect(page.getByTestId("frame-text-editor")).toContainText("12/30");

    // The print stays in sight while writing.
    await expect(page.getByTestId("print-page")).toBeInViewport();

    await page.getByRole("button", { name: "C'est bon" }).click();
    await expect(page.getByTestId("frame-text-edit")).toContainText("Les copines du lycée · 14 juin 2027");
    await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeVisible();
  });

  /**
   * Scenario: Limite de longueur
   *   When je tente de taper un 31e caractère dans une ligne
   *   Then il n'est pas ajouté
   */
  test("30 caractères au plus par ligne ; emojis retirés en tapant", async ({ page }) => {
    await openReview(page);
    await page.getByTestId("frame-text-edit").click();
    await line1(page).fill("");
    await line1(page).pressSequentially("x".repeat(31));
    await expect(line1(page)).toHaveValue("x".repeat(30));

    await line2(page).fill("Fête 🎉 géniale");
    await expect(line2(page)).toHaveValue("Fête  géniale");
  });

  test("le texte part avec la demande d'impression", async ({ page }) => {
    const calls = await openReview(page);
    await page.getByTestId("frame-text-edit").click();
    await line1(page).fill("Tonton Michel en feu");
    await line2(page).fill("14 juin");
    await page.getByRole("button", { name: "C'est bon" }).click();
    await page.getByRole("button", { name: "Imprimer", exact: true }).click();

    await expect(page.getByRole("heading", { name: "C'est parti pour l'impression !" })).toBeVisible();
    expect(calls.prints).toHaveLength(1);
    expect(calls.prints[0]).toMatchObject({ p_frame_line1: "Tonton Michel en feu", p_frame_line2: "14 juin" });
  });

  test("ligne 1 vidée : l'aperçu reprend le texte du cadre, la demande l'envoie vide", async ({ page }) => {
    const calls = await openReview(page);
    await page.getByTestId("frame-text-edit").click();
    await line1(page).fill("");
    await expect(printed(page, 1)).toHaveText("Camille & Hugo");
    await page.getByRole("button", { name: "C'est bon" }).click();
    await page.getByRole("button", { name: "Imprimer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "C'est parti pour l'impression !" })).toBeVisible();
    expect(calls.prints[0]).toMatchObject({ p_frame_line1: "", p_frame_line2: "" });
  });

  test("texte refusé par le serveur : message clair, on peut corriger", async ({ page }) => {
    await openReview(page);
    await page.route("**/rest/v1/rpc/create_print_job", (route) => json(route, { result: "invalid_frame_text" }));
    await page.getByRole("button", { name: "Imprimer", exact: true }).click();
    await expect(page.getByText("Votre texte est trop long : 30 caractères au plus par ligne.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimer", exact: true })).toBeEnabled();
  });

  test("320 × 568 : en écrivant, le tirage et les champs restent visibles", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openReview(page);
    await page.getByTestId("frame-text-edit").click();
    for (const locator of [page.getByTestId("print-page"), line1(page), line2(page), page.getByRole("button", { name: "C'est bon" })]) {
      await expect(locator).toBeInViewport();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });

  /**
   * Scenario: État de l'imprimante visible
   *   Given l'imprimante est déconnectée
   *   When j'arrive sur l'écran de personnalisation
   *   Then le message est visible sans défilement
   */
  test("imprimante déconnectée : visible pendant l'écriture aussi", async ({ page }) => {
    await mockGuestBackend(page, { event: { frame_title: "Camille & Hugo" } });
    await mockPhotoBackend(page, { printerOnline: false });
    await page.goto("/e/jeton-de-test");
    await page.getByRole("button", { name: "Importer une photo" }).waitFor();
    await page.getByLabel("Choisir une photo").setInputFiles({
      name: "p.png",
      mimeType: "image/png",
      buffer: await stripes(800, 1000, [[200, 120, 90]]),
    });
    await page.getByTestId("frame-text-edit").click();
    await expect(page.getByText("L'imprimante n'est pas connectée pour le moment")).toBeInViewport();
  });
});

test.describe("« Vos tirages » et panneau de l'équipe", () => {
  test("la carte du tirage rappelle le texte", async ({ page }) => {
    await mockGuestBackend(page);
    await mockAlbum(page, {
      photos: [{ id: "a" }],
      jobs: [{ ...fakeJob("j1", "PENDING", "a"), frame_line1: "Tonton Michel", frame_line2: "14 juin" }],
    });
    await page.goto("/e/jeton-de-test#tirages");
    await expect(page.getByTestId("print-card-text")).toHaveText("« Tonton Michel · 14 juin »");
  });

  /**
   * Scenario: Visible par l'équipe
   *   Given ma demande attend la validation
   *   Then le panneau opérateur affiche le texte de mon cadre
   */
  test("le panneau opérateur affiche le texte avant le lancement", async ({ page }) => {
    await page.goto("/dev/operator-panel");
    await expect(page.getByTestId("job-frame-text").first()).toHaveText("« Tonton Michel en feu · 14 juin »");
  });
});

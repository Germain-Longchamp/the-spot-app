import { randomUUID } from "crypto";
import { test, expect, Page } from "@playwright/test";
import * as web from "../lib/print/layout";
import * as agent from "../../print-agent/src/layout";
import { layBand, measureEm } from "../../print-agent/src/band";
import { composePage } from "../../print-agent/src/compose";
import { SupabaseJobStore, SupabaseLike } from "../../print-agent/src/supabase-store";
import { mockGuestBackend, mockPhotoBackend } from "./support/guest-mocks";
import { inspect, near, plain, Rgb, stripes } from "./support/images";
import { TestDb } from "./support/test-db";

// SCRUM-60 — The band below the photo: the event's name (line 1, raspberry,
// bold), an optional line 2 (grey capitals) and the The Spot icon, as drawn
// by Alison (2-personnaliser-cadre), the same on the phone and on the print.

const WHITE: Rgb = [255, 255, 255];
const RASPBERRY: Rgb = [0xad, 0x35, 0x4e];
const GREY: Rgb = [0x5a, 0x47, 0x4b];
/** The icon's colour (the brand's peach). */
const PEACH: Rgb = [0xec, 0x9a, 0x62];

test.describe("règles de la bande", () => {
  test("le site et l'agent ont les mêmes réglages", () => {
    expect(agent.BAND).toEqual(web.BAND);
    expect(agent.bandTextWidthMm()).toBe(web.bandTextWidthMm());
  });

  test("tailles de la maquette d'Alison, mises à l'échelle du papier", () => {
    // 248 px of mockup for 101.6 mm of paper.
    expect(web.BAND.line1.sizeMm).toBeCloseTo(6.55, 2);
    expect(web.BAND.line2.sizeMm).toBeCloseTo(4.3, 2);
    expect(web.BAND.iconMm).toBeCloseTo(9.01, 2);
    // Text and icon within the photo's width: at least 6.8 mm from the edges.
    expect(web.bandTextWidthMm() + web.BAND.iconMm + web.BAND.iconGapMm).toBeCloseTo(88, 5);
  });

  test("Inter, avec les mesures que le site utilise", () => {
    // The browser's line box and the agent's must match: Inter's own.
    // (unitsPerEm 2048, ascender 1984, descender -494)
    expect(web.BAND.lineHeight).toBeCloseTo((1984 + 494) / 2048, 2);
    expect(web.BAND.ascender).toBe(1984 / 2048);
  });

  test("texte nettoyé : ni emoji, ni caractère de contrôle ; ligne 2 en capitales", () => {
    expect(web.cleanLine("  Camille 🎉 &   Hugo ❤️\u0007 ", web.BAND.line1)).toBe("Camille & Hugo");
    expect(web.cleanLine("14 juin 2027", web.BAND.line2)).toBe("14 JUIN 2027");
    expect(web.cleanLine("🎉🎉", web.BAND.line1)).toBe("");
    expect(web.cleanLine(null, web.BAND.line1)).toBe("");
  });

  test("un texte court garde la taille de la maquette", () => {
    const fitted = web.fitLine("Salon démo", web.BAND.line1, 75, () => 5);
    expect(fitted).toEqual({ text: "Salon démo", sizeMm: web.BAND.line1.sizeMm });
  });

  test("un texte long rétrécit, puis se termine par « … »", () => {
    // 1 em per character, to keep the sums simple.
    const perChar = (t: string) => Array.from(t).length;
    const max = 75;
    const shrunk = web.fitLine("x".repeat(15), web.BAND.line1, max, perChar);
    expect(shrunk.text).toBe("x".repeat(15));
    expect(shrunk.sizeMm).toBeCloseTo(5);

    const cut = web.fitLine("x".repeat(40), web.BAND.line1, max, perChar);
    expect(cut.sizeMm).toBe(web.BAND.line1.minSizeMm);
    expect(cut.text.endsWith("…")).toBe(true);
    expect(perChar(cut.text) * cut.sizeMm).toBeLessThanOrEqual(max);
  });

  test("dans l'agent, 30 caractères larges tiennent dans la bande", () => {
    const [line] = layBand({ line1: "W".repeat(30) });
    expect(line.sizeMm).toBeGreaterThanOrEqual(web.BAND.line1.minSizeMm);
    expect(measureEm(line.text, web.BAND.line1) * line.sizeMm).toBeLessThanOrEqual(web.bandTextWidthMm());
  });
});

test.describe("page composée par l'agent", () => {
  const { page: sheet, photo } = web.pageLayoutPx();
  const bandTop = photo.top + photo.height;
  const dpmm = 300 / 25.4;
  const textRight = photo.left + Math.ceil(web.bandTextWidthMm() * dpmm);
  const iconLeft = photo.left + photo.width - Math.round(web.BAND.iconMm * dpmm);

  /** The pixels of a zone that are close to a colour. */
  async function count(image: Buffer, color: Rgb, x0: number, x1: number, y0 = bandTop, y1 = sheet.height) {
    const page = await inspect(image);
    let n = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) if (near(page.at(x, y), color, 40)) n++;
    }
    return n;
  }

  /**
   * Scenario: Tirage avec cadre par défaut
   *   Given un événement dont le texte du cadre est "Camille & Hugo"
   *   When une photo est imprimée sans personnalisation
   *   Then l'image envoyée à print() contient "Camille & Hugo" et l'icône dans la bande du bas
   */
  test("le nom de l'événement en framboise, l'icône à droite", async () => {
    const image = await composePage(await plain(800, 1000, [40, 90, 160]), {
      crop: null,
      frame: { line1: "Camille & Hugo" },
    });
    const page = await inspect(image);
    expect([page.width, page.height]).toEqual([1200, 1800]);

    // Raspberry letters at the photo's left edge, in the band.
    expect(await count(image, RASPBERRY, photo.left, textRight)).toBeGreaterThan(200);
    // The icon, peach, in its square on the right.
    expect(await count(image, PEACH, iconLeft, photo.left + photo.width)).toBeGreaterThan(50);
    // Nothing printed in the borders, nor under 4 mm from the paper's edge.
    const margin = Math.round(4 * dpmm);
    expect(await count(image, RASPBERRY, 0, photo.left)).toBe(0);
    expect(await count(image, RASPBERRY, photo.left + photo.width, sheet.width)).toBe(0);
    expect(await count(image, RASPBERRY, 0, sheet.width, sheet.height - margin, sheet.height)).toBe(0);
    // The photo is untouched.
    expect(near(page.at(600, 700), [40, 90, 160])).toBe(true);
  });

  /**
   * Scenario: Deux lignes
   *   Given la ligne 1 "Les copines du lycée" et la ligne 2 "14 juin 2027"
   *   When la photo est imprimée
   *   Then les deux lignes figurent dans la bande du bas
   */
  test("deux lignes : la seconde en gris, sous la première", async () => {
    const one = await composePage(await plain(800, 1000, WHITE), {
      crop: null,
      frame: { line1: "Les copines du lycée" },
    });
    const two = await composePage(await plain(800, 1000, WHITE), {
      crop: null,
      frame: { line1: "Les copines du lycée", line2: "14 juin 2027" },
    });
    expect(await count(one, GREY, photo.left, textRight)).toBeLessThan(20);
    expect(await count(two, GREY, photo.left, textRight)).toBeGreaterThan(100);
  });

  test("texte très long : réduit et coupé, jamais sur l'icône", async () => {
    const image = await composePage(await plain(800, 1000, WHITE), {
      crop: null,
      frame: { line1: "W".repeat(60), line2: "W".repeat(60) },
    });
    expect(await count(image, RASPBERRY, photo.left, textRight)).toBeGreaterThan(200);
    // The gap between the text and the icon stays white.
    const page = await inspect(image);
    for (let y = bandTop; y < sheet.height; y += 3) {
      for (let x = textRight + 2; x < iconLeft - 2; x += 3) {
        expect(near(page.at(x, y), WHITE, 12), `${x},${y}`).toBe(true);
      }
    }
  });

  test("sans texte : la bande reste blanche (photos d'avant)", async () => {
    const image = await composePage(await stripes(800, 1000, [[40, 90, 160]]), { crop: null });
    expect(await count(image, RASPBERRY, 0, sheet.width)).toBe(0);
  });

  test("accents et caractères spéciaux : dessinés avec la police embarquée", async () => {
    const image = await composePage(await plain(800, 1000, WHITE), {
      crop: null,
      frame: { line1: "Éloïse & Noël — œuvre « ça »" },
    });
    expect(await count(image, RASPBERRY, photo.left, textRight)).toBeGreaterThan(200);
  });

  test("l'agent lit les textes envoyés avec le job", async () => {
    const answer = (frame: unknown) =>
      ({
        rpc: async () => ({
          data: { result: "claimed", job_id: "j1", attempt: 1, storage_path: "e/p.jpg", frame },
          error: null,
        }),
      }) as unknown as SupabaseLike;
    const config = { eventId: "e", agentId: "a", bucket: "photos", downloadTimeoutMs: 1000 };

    expect((await new SupabaseJobStore(answer({ line1: "Salon", line2: null }), config).claim())?.frame)
      .toEqual({ line1: "Salon", line2: null });
    expect((await new SupabaseJobStore(answer({ line1: "  " }), config).claim())?.frame).toBeNull();
    expect((await new SupabaseJobStore(answer(undefined), config).claim())?.frame).toBeNull();
  });
});

test.describe("base de données", () => {
  let db: TestDb;
  test.beforeAll(async () => {
    db = await TestDb.start();
  });
  test.afterAll(async () => {
    await db?.stop();
  });

  test("l'agent reçoit le nom de l'événement avec le job", async () => {
    const f = await db.seed({ limit: 5 });
    await db.admin.query("update public.events set name = 'Camille & Hugo' where id = $1", [f.eventId]);
    const { job_id } = await db.createPrintJob(f.userId, f.photoId, randomUUID());
    await db.admin.query("update public.print_jobs set authorized_at = now() where id = $1", [job_id]);

    const claimed = await db.service<Record<string, unknown>>("claim_print_job", f.eventId, "agent-test");
    expect(claimed.result).toBe("claimed");
    expect(claimed.frame).toEqual({ line1: "Camille & Hugo", line2: null });
  });
});

test.describe("aperçu sur le téléphone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function openReview(page: Page, name = "Salon de démonstration") {
    await mockGuestBackend(page, { event: { name, gallery_enabled: true, gallery_visible: true } });
    await mockPhotoBackend(page);
    await page.goto("/e/jeton-de-test");
    await page.getByRole("button", { name: "Importer une photo" }).waitFor();
    await page.getByLabel("Choisir une photo").setInputFiles({
      name: "p.png",
      mimeType: "image/png",
      buffer: await stripes(800, 1000, [[200, 120, 90]]),
    });
    await expect(page.getByTestId("print-photo")).toBeVisible();
    // The screen's entrance animation moves and scales it: measure after.
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  }

  /**
   * Scenario: Aperçu fidèle
   *   When je regarde l'aperçu avant impression
   *   Then le texte et l'icône y sont placés comme sur l'image envoyée à l'imprimante
   */
  test("le nom de l'événement et l'icône, placés comme sur le tirage", async ({ page }) => {
    await openReview(page, "Camille & Hugo");
    const sheet = (await page.getByTestId("print-page").boundingBox())!;
    const photo = (await page.getByTestId("print-photo").boundingBox())!;
    const line = page.getByTestId("print-line1");
    const icon = page.getByTestId("print-icon");

    await expect(line).toHaveText("Camille & Hugo");
    await expect(page.getByTestId("print-line2")).toHaveCount(0);
    const style = await line.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, weight: s.fontWeight, size: parseFloat(s.fontSize) };
    });
    expect(style.color).toBe("rgb(173, 53, 78)");
    expect(style.weight).toBe("700");
    // Sizes in paper millimetres, at the page's scale.
    const mm = sheet.width / web.PRINT_LAYOUT.paperMm.width;
    expect(style.size / mm).toBeCloseTo(web.BAND.line1.sizeMm, 1);

    // The letters themselves, not the line's box.
    const text = await line.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const box = (await icon.boundingBox())!;
    // Text from the photo's left edge, icon to its right edge, both in the band.
    expect(Math.abs(text.x - photo.x)).toBeLessThan(1.5);
    expect(Math.abs(box.x + box.width - (photo.x + photo.width))).toBeLessThan(1.5);
    expect(box.width / mm).toBeCloseTo(web.BAND.iconMm, 0);
    for (const b of [text, box]) {
      expect(b.y).toBeGreaterThan(photo.y + photo.height);
      expect(b.y + b.height).toBeLessThan(sheet.y + sheet.height);
    }
    // The icon centred in the band.
    const bandMiddle = (photo.y + photo.height + sheet.y + sheet.height) / 2;
    expect(Math.abs(box.y + box.height / 2 - bandMiddle)).toBeLessThan(2.5);
  });

  test("nom très long : réduit ou coupé, il ne touche pas l'icône", async ({ page }) => {
    await openReview(page, "Grand salon international de la photographie et de l'image 2027");
    const line = page.getByTestId("print-line1");
    await expect(line).toBeVisible();
    const text = (await line.boundingBox())!;
    const icon = (await page.getByTestId("print-icon").boundingBox())!;
    expect(text.x + text.width).toBeLessThan(icon.x);
    // Once Inter has loaded, the line is fitted, not cut by the browser.
    await expect.poll(() => line.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  });

  test("le plein écran montre aussi la bande", async ({ page }) => {
    await openReview(page, "Camille & Hugo");
    await page.getByRole("button", { name: "Voir le tirage en grand" }).click();
    const zoom = page.getByRole("dialog", { name: "Tirage en grand" });
    await expect(zoom.getByTestId("print-line1")).toHaveText("Camille & Hugo");
    await expect(zoom.getByTestId("print-icon")).toBeVisible();
  });
});

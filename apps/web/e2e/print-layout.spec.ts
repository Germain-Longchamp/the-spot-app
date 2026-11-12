import { test, expect } from "@playwright/test";
import * as web from "../lib/print/layout";
import * as agent from "../../print-agent/src/layout";
import { composePage } from "../../print-agent/src/compose";
import { SimulatedPrinter } from "../../print-agent/src/printer";
import { SupabaseJobStore, SupabaseLike } from "../../print-agent/src/supabase-store";
import { ClaimedJob, JobStore, processNextJob, WorkerDeps } from "../../print-agent/src/worker";
import { inspect, near, plain, Rgb, stripes } from "./support/images";

// SCRUM-65 — The Polaroid print: one layout, shared by the preview on the
// phone and the page the agent sends to the printer.

const WHITE: Rgb = [255, 255, 255];
const RED: Rgb = [220, 30, 30];
const GREEN: Rgb = [30, 180, 60];
const BLUE: Rgb = [30, 60, 220];

test.describe("mise en page", () => {
  test("le site et l'agent ont la même mise en page", () => {
    expect(agent.PRINT_LAYOUT).toEqual(web.PRINT_LAYOUT);
    expect(agent.PHOTO_RATIO).toBe(web.PHOTO_RATIO);
    expect(agent.pageLayoutPx()).toEqual(web.pageLayoutPx());
    expect(agent.pageLayoutPercent()).toEqual(web.pageLayoutPercent());
    for (const [w, h] of [[2048, 1536], [1536, 2048], [1600, 2000], [1000, 1000], [4000, 900]]) {
      expect(agent.centerCrop(w, h)).toEqual(web.centerCrop(w, h));
    }
  });

  test("format Polaroid : 10 × 15 en hauteur, photo 8 × 10 cm à 1 cm du haut", () => {
    expect(web.PHOTO_RATIO).toBe(0.8);
    const { page, photo } = web.pageLayoutPx();
    // 4 × 6 inches at 300 dpi.
    expect(page).toEqual({ width: 1200, height: 1800 });
    expect(photo).toEqual({ left: 128, top: 118, width: 945, height: 1181 });
    // What is left below the photo: the band for texts (SCRUM-60), about 4 cm.
    const bandMm = ((page.height - photo.top - photo.height) / 300) * 25.4;
    expect(bandMm).toBeGreaterThan(40);
    expect(bandMm).toBeLessThan(43);
  });

  test("recadrage centré en 4:5", () => {
    // Landscape 4:3: the middle 60 % of the width.
    const landscape = web.centerCrop(2048, 1536);
    expect(landscape.x).toBeCloseTo(0.2);
    expect(landscape.w).toBeCloseTo(0.6);
    expect(landscape).toMatchObject({ y: 0, h: 1 });
    // Portrait 3:4: a little off the top and bottom.
    const portrait = web.centerCrop(1536, 2048);
    expect(portrait).toMatchObject({ x: 0, w: 1 });
    expect(portrait.h).toBeCloseTo(0.9375);
    expect(portrait.y).toBeCloseTo(0.03125);
    // From the app's camera, already 4:5: all of it.
    expect(web.centerCrop(1600, 2000)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  test("une zone hors de la photo ou aux mauvaises proportions est invalide", () => {
    expect(web.isValidCrop(web.centerCrop(2048, 1536), 2048, 1536)).toBe(true);
    expect(web.isValidCrop({ x: 0.5, y: 0, w: 0.6, h: 1 }, 2048, 1536)).toBe(false);
    expect(web.isValidCrop({ x: -0.1, y: 0, w: 0.6, h: 1 }, 2048, 1536)).toBe(false);
    expect(web.isValidCrop({ x: 0, y: 0, w: 1, h: 1 }, 2048, 1536)).toBe(false);
    expect(web.isValidCrop({ x: 0, y: 0, w: 0, h: 1 }, 2048, 1536)).toBe(false);
  });
});

test.describe("page composée par l'agent", () => {
  /**
   * Scenario: Le tirage correspond à l'aperçu
   *   Given ma photo a une zone de recadrage enregistrée
   *   When l'agent prépare le tirage
   *   Then l'image envoyée est une page 10 × 15 en hauteur
   *   And la zone photo de 8 × 10 cm contient exactement cette zone, à 1 cm des bords haut, gauche et droite
   *   And la bande du bas de 4 cm est blanche
   */
  test("la zone enregistrée, posée dans le cadre Polaroid", async () => {
    // Left half red, right half blue; the zone keeps only some of the blue.
    const photo = await stripes(1000, 1000, [RED, BLUE]);
    const page = await inspect(await composePage(photo, { crop: { x: 0.55, y: 0, w: 0.4, h: 0.5 } }));

    expect([page.width, page.height]).toEqual([1200, 1800]);
    // The photo area: blue everywhere, from edge to edge.
    for (const [x, y] of [[135, 125], [1065, 125], [600, 700], [135, 1290], [1065, 1290]]) {
      expect(near(page.at(x, y), BLUE), `${x},${y}`).toBe(true);
    }
    // White borders, top and sides, and the white band below.
    for (const [x, y] of [[60, 60], [600, 60], [1140, 600], [60, 600], [600, 1500], [600, 1780]]) {
      expect(near(page.at(x, y), WHITE, 5), `${x},${y}`).toBe(true);
    }
  });

  /**
   * Scenario: Photo sans zone enregistrée
   *   Given une photo envoyée avant cette version
   *   When l'agent prépare le tirage
   *   Then elle est recadrée au centre en 4:5 et posée dans le cadre
   */
  test("photo sans zone : le centre en 4:5", async () => {
    // Three stripes: the middle 4:5 of a 1500 × 1000 photo is x = 100 to 900
    // of 1500... that is, a third of red, all the green, a third of blue.
    const photo = await stripes(1500, 1000, [RED, GREEN, BLUE]);
    const page = await inspect(await composePage(photo, { crop: null }));

    expect(near(page.at(140, 700), RED)).toBe(true);
    expect(near(page.at(600, 700), GREEN)).toBe(true);
    expect(near(page.at(1060, 700), BLUE)).toBe(true);
  });

  test("pilote qui prend la page couchée : même tirage, tourné", async () => {
    const page = await inspect(
      await composePage(await plain(800, 1000, BLUE), { crop: null, landscape: true })
    );
    expect([page.width, page.height]).toEqual([1800, 1200]);
  });

  test("une image illisible ne donne pas de page", async () => {
    await expect(composePage(Buffer.from("pas une image"), { crop: null })).rejects.toThrow();
  });
});

test.describe("dans l'agent", () => {
  const job: ClaimedJob = {
    jobId: "j1",
    attempt: 1,
    storagePath: "e/g/p.jpg",
    crop: { x: 0, y: 0, w: 1, h: 1 },
  };

  function deps(compose: WorkerDeps["compose"], printed: Buffer[], reports: string[]) {
    let claimed = false;
    const store: JobStore = {
      claim: async () => (claimed ? null : ((claimed = true), job)),
      isCurrent: async () => true,
      downloadImage: async () => Buffer.from("photo"),
      report: async (_job, status, detail) => {
        reports.push(`${status}${detail ? `: ${detail}` : ""}`);
        return "applied";
      },
      heartbeat: async () => {},
    };
    const printer = new SimulatedPrinter({ delayMs: 0, outcome: "success" });
    const deps: WorkerDeps = {
      store,
      printer: { print: async (image, options) => (printed.push(image), printer.print()) },
      log: { info: () => {}, error: () => {} },
      sleep: async () => {},
      printOptions: { copies: 1 },
      compose,
      activeJob: { current: null },
      shouldStop: () => false,
      downloadAttempts: 1,
      retryDelayMs: 0,
      maxRetryDelayMs: 0,
    };
    return deps;
  }

  test("l'imprimante reçoit la page composée, pas la photo", async () => {
    const printed: Buffer[] = [];
    const reports: string[] = [];
    const seen: ClaimedJob[] = [];
    const page = Buffer.from("page");

    await processNextJob(deps(async (_image, j) => (seen.push(j), page), printed, reports));

    expect(printed).toEqual([page]);
    expect(seen[0].crop).toEqual(job.crop);
    expect(reports).toEqual(["DONE"]);
  });

  test("mise en page impossible : rien n'est imprimé, l'équipe voit un souci", async () => {
    const printed: Buffer[] = [];
    const reports: string[] = [];

    await processNextJob(
      deps(async () => { throw new Error("illisible"); }, printed, reports)
    );

    expect(printed).toHaveLength(0);
    expect(reports).toEqual(["FAILED: Mise en page impossible"]);
  });

  test("l'agent lit la zone envoyée avec le job", async () => {
    const answer = (crop: unknown) =>
      ({
        rpc: async () => ({
          data: { result: "claimed", job_id: "j1", attempt: 1, storage_path: "e/p.jpg", crop },
          error: null,
        }),
      }) as unknown as SupabaseLike;
    const config = { eventId: "e", agentId: "a", bucket: "photos", downloadTimeoutMs: 1000 };

    expect((await new SupabaseJobStore(answer({ x: 0.2, y: 0, w: 0.6, h: 1 }), config).claim())?.crop)
      .toEqual({ x: 0.2, y: 0, w: 0.6, h: 1 });
    expect((await new SupabaseJobStore(answer(null), config).claim())?.crop).toBeNull();
  });
});

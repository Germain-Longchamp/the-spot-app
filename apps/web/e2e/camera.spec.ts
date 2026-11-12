import { test, expect, Page } from "@playwright/test";
import { mockGuestBackend } from "./support/guest-mocks";

const URL = "/e/jeton-de-test";

// Chrome's fake camera: the real capture code runs on a real video stream.
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

async function openCamera(page: Page) {
  await mockGuestBackend(page);
  await page.goto(URL);
  await page.getByRole("button", { name: "Prendre une photo" }).click();
}

/** Makes getUserMedia fail the way a browser would. */
const failCameraWith = (page: Page, name: string) =>
  page.addInitScript((errorName) => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("refus", errorName));
  }, name);

/**
 * Scenario: Permission accordée
 *   When je choisis "Prendre une photo" et j'autorise la caméra
 *   Then le flux caméra s'affiche en grand, dans le cadre du tirage (SCRUM-65)
 */
test("le flux caméra s'affiche en grand, dans le cadre du tirage", async ({ page }) => {
  await openCamera(page);

  const video = page.getByLabel("Aperçu de la caméra");
  await expect(page.getByRole("button", { name: "Prendre la photo" })).toBeEnabled();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth))
    .toBeGreaterThan(0);

  // The video fills the 4:5 frame, as tall as the screen allows.
  const box = (await video.boundingBox())!;
  const frame = (await page.getByTestId("camera-frame").boundingBox())!;
  expect(box).toEqual(frame);
  expect(frame.width / frame.height).toBeCloseTo(0.8, 2);
  expect(frame.height).toBeGreaterThan(page.viewportSize()!.height / 2);
});

/**
 * Scenario: Capture
 *   When j'appuie sur le bouton de capture
 *   Then la photo est prise et j'arrive sur la prévisualisation
 */
test("la capture mène à la prévisualisation", async ({ page }) => {
  await openCamera(page);
  const shutter = page.getByRole("button", { name: "Prendre la photo" });
  await expect(shutter).toBeEnabled();
  await expect
    .poll(() =>
      page
        .getByLabel("Aperçu de la caméra")
        .evaluate((v: HTMLVideoElement) => v.videoWidth)
    )
    .toBeGreaterThan(0);

  await shutter.click();

  const photo = page.getByRole("img", { name: "Votre photo" });
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
});

test("rien n'est envoyé au serveur pendant la capture", async ({ page }) => {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/storage/")) uploads.push(request.url());
  });
  await openCamera(page);
  await expect(page.getByRole("button", { name: "Prendre la photo" })).toBeEnabled();

  await page.getByRole("button", { name: "Retour" }).click();

  await expect(
    page.getByRole("button", { name: "Prendre une photo" })
  ).toBeVisible();
  expect(uploads).toEqual([]);
});

test("la caméra s'éteint en quittant l'écran", async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as unknown as { streams: MediaStream[] }).streams = [
        ...((window as unknown as { streams?: MediaStream[] }).streams ?? []),
        stream,
      ];
      return stream;
    };
  });
  await openCamera(page);
  await expect(page.getByRole("button", { name: "Prendre la photo" })).toBeEnabled();

  await page.getByRole("button", { name: "Retour" }).click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { streams: MediaStream[] }).streams.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended")
        )
      )
    )
    .toBe(true);
});

/**
 * Scenario: Permission refusée
 *   When je refuse l'accès à la caméra
 *   Then un message simple m'explique la situation
 *   And l'import d'une photo m'est proposé
 */
test("permission refusée : explication et import proposé", async ({ page }) => {
  await failCameraWith(page, "NotAllowedError");
  await openCamera(page);

  await expect(page.getByRole("alert").filter({ hasText: "caméra" })).toContainText(
    "réglages du site"
  );
  await expect(
    page.getByRole("button", { name: "Importer une photo" })
  ).toBeVisible();
});

/** Cas limite : caméra déjà utilisée par une autre application. */
test("caméra déjà utilisée : message adapté", async ({ page }) => {
  await failCameraWith(page, "NotReadableError");
  await openCamera(page);

  await expect(page.getByRole("alert").filter({ hasText: "caméra" })).toContainText(
    "déjà utilisée"
  );
});

/** Cas limite : navigateur intégré à une application, sans accès caméra. */
test("navigateur sans caméra : proposer Safari ou Chrome", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined });
  });
  await openCamera(page);

  await expect(page.getByRole("alert").filter({ hasText: "caméra" })).toContainText(
    "Safari ou Chrome"
  );
});

/**
 * Scenario: Changement de caméra
 *   Given mon téléphone a deux caméras
 *   When j'appuie sur le bouton de bascule
 *   Then la caméra utilisée change
 */
test("le bouton de bascule change de caméra", async ({ page }) => {
  await page.addInitScript(() => {
    const requests: string[] = [];
    (window as unknown as { requests: string[] }).requests = requests;
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );
    navigator.mediaDevices.getUserMedia = (constraints) => {
      const video = (constraints as MediaStreamConstraints)
        .video as MediaTrackConstraints;
      requests.push(String(video.facingMode));
      return original(constraints);
    };
    navigator.mediaDevices.enumerateDevices = async () =>
      [{ kind: "videoinput" }, { kind: "videoinput" }] as MediaDeviceInfo[];
  });
  await openCamera(page);

  await page.getByRole("button", { name: "Changer de caméra" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { requests: string[] }).requests)
    )
    .toContain("user");
});

import type { Page } from "@playwright/test";
import type { PrintJobStatus } from "../../lib/print/job-status";
import { cors, GUEST_ID, json, TEST_EVENT } from "./guest-mocks";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

export interface FakePhoto {
  id: string;
  is_published?: boolean;
  created_at?: string;
}

export interface FakeJob {
  id: string;
  photo_id: string;
  status: PrintJobStatus;
  created_at: string;
}

export const fakeJob = (
  id: string,
  status: PrintJobStatus,
  photo = `photo-${id}`,
  created_at = "2026-11-06T13:32:00.000Z"
): FakeJob => ({ id, photo_id: photo, status, created_at });

const pathOf = (id: string) => `${TEST_EVENT.id}/${GUEST_ID}/${id}.jpg`;

/**
 * Fakes the guest's photos, their print requests, the signed links and the
 * files. The returned state can be changed to move a request along.
 */
export async function mockAlbum(
  page: Page,
  initial: {
    photos?: FakePhoto[];
    jobs?: FakeJob[];
    printerOnline?: boolean;
    /** Waiting requests before each photo's own, by photo id (SCRUM-53). */
    ahead?: Record<string, number>;
    availability?: string;
  } = {}
) {
  const state = {
    photos: initial.photos ?? [],
    jobs: initial.jobs ?? [],
    fail: false,
    photoQueries: [] as string[],
    galleryQueries: [] as string[],
    jobQueries: [] as string[],
    created: [] as Record<string, unknown>[],
    ahead: initial.ahead ?? ({} as Record<string, number>),
    positionQueries: 0,
  };

  await page.route("**/rest/v1/photos?**", (route) => {
    state.photoQueries.push(route.request().url());
    if (state.fail) return route.abort("internetdisconnected");
    return json(
      route,
      state.photos.map((photo) => ({
        id: photo.id,
        storage_path: pathOf(photo.id),
        thumb_path: null,
        is_published: photo.is_published ?? false,
        created_at: photo.created_at ?? "2026-11-06T13:30:00.000Z",
      }))
    );
  });
  // The gallery view (SCRUM-63): the guest's photos, marked as theirs.
  await page.route("**/rest/v1/gallery_photos?**", (route) => {
    const url = route.request().url();
    state.galleryQueries.push(url);
    if (state.fail) return route.abort("internetdisconnected");
    // The home's counter (SCRUM-57): a count only, in the Content-Range header.
    if (route.request().method() === "HEAD") {
      const shared = url.includes("is_published=eq.true");
      const n = state.photos.filter((photo) => !shared || photo.is_published).length;
      return route.fulfill({
        status: 200,
        headers: {
          ...cors,
          "access-control-expose-headers": "content-range",
          "content-range": `*/${n}`,
        },
      });
    }
    return json(
      route,
      state.photos.map((photo) => ({
        id: photo.id,
        storage_path: pathOf(photo.id),
        thumb_path: null,
        is_published: photo.is_published ?? false,
        is_mine: true,
      }))
    );
  });
  await page.route("**/rest/v1/print_jobs?**", (route) => {
    state.jobQueries.push(route.request().url());
    if (state.fail) return route.abort("internetdisconnected");
    return json(route, state.jobs);
  });
  await page.route("**/storage/v1/object/sign/photos", (route) => {
    const { paths } = route.request().postDataJSON() as { paths: string[] };
    return json(
      route,
      paths.map((path) => ({ path, error: null, signedURL: `/object/sign/photos/${path}?token=t` }))
    );
  });
  await page.route("**/storage/v1/object/sign/photos/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG })
  );
  await page.route("**/rest/v1/rpc/get_printer_status", (route) =>
    json(route, initial.printerOnline ?? true)
  );
  await page.route("**/rest/v1/rpc/get_print_availability", (route) =>
    json(route, initial.availability ?? "available")
  );
  // The place in the queue: only the guest's waiting requests, as numbers.
  await page.route("**/rest/v1/rpc/guest_queue_positions", (route) => {
    state.positionQueries += 1;
    if (state.fail) return route.abort("internetdisconnected");
    return json(
      route,
      state.jobs
        .filter((job) => job.status === "PENDING" && job.photo_id in state.ahead)
        .map((job) => ({ photo_id: job.photo_id, ahead: state.ahead[job.photo_id] }))
    );
  });
  await page.route("**/rest/v1/rpc/create_print_job", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.created.push(body);
    state.jobs = [fakeJob(`new-${state.created.length}`, "PENDING", String(body.p_photo_id), "2026-11-06T13:59:00.000Z"), ...state.jobs];
    return json(route, { result: "created", job_id: `new-${state.created.length}` });
  });

  return state;
}

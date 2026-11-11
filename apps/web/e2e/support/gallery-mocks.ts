import type { Page } from "@playwright/test";
import { GALLERY_PAGE_SIZE } from "../../lib/guest/gallery";
import { cors, json, TEST_EVENT } from "./guest-mocks";

export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

export const row = (id: string, created_at = "2026-11-06T13:00:00.000Z") => ({
  id,
  storage_path: `${TEST_EVENT.id}/someone/${id}.jpg`,
  thumb_path: `${TEST_EVENT.id}/someone/${id}-thumb.jpg`,
  is_published: true,
  is_mine: false,
  created_at,
});

/**
 * Fakes the gallery view (SCRUM-63) and its files; records what was asked.
 * `ids` (newest first) can change afterwards: a photo first seen later is
 * newer than all the others.
 */
export async function mockGallery(
  page: Page,
  initial: string[],
  options: { missing?: string[]; mine?: string[] } = {}
) {
  const asked = {
    ids: [...initial],
    fail: false,
    queries: [] as string[],
    signed: [] as string[],
  };
  const stamps = new Map<string, string>();
  let clock = 0;
  const stampOf = (id: string) => {
    if (!stamps.has(id)) {
      clock += 1;
      stamps.set(id, new Date(Date.UTC(2026, 10, 6, 13, 0, clock)).toISOString());
    }
    return stamps.get(id)!;
  };
  // The first ones listed are the newest.
  [...initial].reverse().forEach(stampOf);

  await page.route("**/rest/v1/gallery_photos?**", (route) => {
    const url = new globalThis.URL(route.request().url());
    asked.queries.push(url.search);
    if (asked.fail) return route.abort("internetdisconnected");
    if (route.request().method() === "HEAD") {
      return route.fulfill({
        status: 200,
        headers: {
          ...cors,
          "access-control-expose-headers": "content-range",
          "content-range": `*/${asked.ids.length}`,
        },
      });
    }
    const from = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? GALLERY_PAGE_SIZE);
    return json(
      route,
      asked.ids.slice(from, from + limit).map((id) => ({
        ...row(id, stampOf(id)),
        is_mine: (options.mine ?? []).includes(id),
      }))
    );
  });
  await page.route("**/storage/v1/object/sign/photos", (route) => {
    const { paths } = route.request().postDataJSON() as { paths: string[] };
    asked.signed.push(...paths);
    return json(
      route,
      paths.map((path) => ({ path, error: null, signedURL: `/object/sign/photos/${path}?token=t` }))
    );
  });
  await page.route("**/storage/v1/object/sign/photos/**", (route) => {
    const missing = (options.missing ?? []).some((id) => route.request().url().includes(id));
    return missing
      ? route.fulfill({ status: 404, body: "" })
      : route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
  return asked;
}


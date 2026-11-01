import type { Page, Route } from "@playwright/test";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};

export const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, headers: cors, json: body });

function fakeJwt() {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      sub: "11111111-1111-4111-8111-111111111111",
      role: "authenticated",
      is_anonymous: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    "signature",
  ].join(".");
}

export const TEST_EVENT = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Salon de démonstration",
  gallery_visible: false,
};

interface GuestBackend {
  entry?: string;
  event?: Partial<typeof TEST_EVENT>;
  failEntry?: boolean;
}

/** Fakes Supabase for a guest. Returns the anonymous sign-ins it received. */
export async function mockGuestBackend(page: Page, backend: GuestBackend = {}) {
  const calls = { signups: 0, joins: 0 };

  await page.route("**/rest/v1/rpc/get_event_entry", (route) =>
    backend.failEntry
      ? route.abort("internetdisconnected")
      : json(route, backend.entry ?? "open")
  );
  await page.route("**/auth/v1/signup", (route) => {
    calls.signups++;
    return json(route, {
      access_token: fakeJwt(),
      refresh_token: "refresh",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        aud: "authenticated",
        role: "authenticated",
        is_anonymous: true,
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    });
  });
  await page.route("**/rest/v1/rpc/join_event", (route) => {
    calls.joins++;
    return json(route, {
      result: "joined",
      guest_id: "33333333-3333-4333-8333-333333333333",
      event: { ...TEST_EVENT, ...backend.event },
    });
  });

  return calls;
}

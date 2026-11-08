import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import { noStoreFetch } from "../lib/supabase/no-store";

const source = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");

test("les lectures côté serveur ne sont jamais mises en cache", async () => {
  const seen: RequestInit[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    seen.push(init ?? {});
    return new Response("[]");
  }) as typeof fetch;
  try {
    await noStoreFetch("https://example.test/rest/v1/print_jobs", {
      headers: { apikey: "x" },
      cache: "force-cache",
    });
  } finally {
    globalThis.fetch = original;
  }

  expect(seen[0].cache).toBe("no-store");
  expect(seen[0].headers).toEqual({ apikey: "x" });
});

test("les clients Supabase côté serveur passent par ce fetch", () => {
  for (const file of ["lib/supabase/admin.ts", "lib/supabase/server.ts"]) {
    expect(source(file), file).toContain("global: { fetch: noStoreFetch }");
  }
});

test("le panneau opérateur interdit le cache des lectures", () => {
  const page = source("app/operateur/[token]/page.tsx");
  expect(page).toContain('export const dynamic = "force-dynamic"');
  expect(page).toContain('export const fetchCache = "force-no-store"');
  expect(page).toContain("export const revalidate = 0");
});

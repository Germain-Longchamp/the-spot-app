import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // The "github" reporter names failing tests directly in the CI run.
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  forbidOnly: !!process.env.CI,
  // Flaky tests must be fixed or isolated, never hidden by a retry (SCRUM-40).
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key",
    },
  },
});

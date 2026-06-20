import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// E2E tests run a real browser against the actual HTTPS dev server (mkcert
// self-signed cert) and seed/verify state directly in the DB the dev server reads
// (DATABASE_URL). dotenv makes that connection string available to the test runner
// so the seed helpers can talk to the same database.
dotenv.config({ path: ".env.local" });

// Target whatever host the app canonicalizes to. The app redirects to
// NEXT_PUBLIC_BASE_URL (e.g. a LAN IP in dev), so targeting a different host would
// trigger a cross-host redirect that breaks the auth-cookie flow. `ignoreHTTPSErrors`
// covers the mkcert cert not necessarily listing that exact host.
const baseURL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://localhost:3000";

export default defineConfig({
  testDir: "__tests__/e2e",
  // Specs seed shared DB rows, so run them serially rather than in parallel.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL,
    ignoreHTTPSErrors: true, // the dev server uses a mkcert self-signed cert
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  expect: {
    // Visual snapshots: a small tolerance absorbs anti-aliasing/font-rendering noise.
    // NB Playwright snapshots are OS-specific — regenerate baselines per platform/CI.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  projects: [
    // Signs in once via the real form and saves the session; other specs reuse it.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "__tests__/e2e/.auth/buyer.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000, // `next dev` + prisma generate can be slow to boot
  },
});

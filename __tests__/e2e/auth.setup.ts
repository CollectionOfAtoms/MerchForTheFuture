import { test as setup } from "@playwright/test";
import { ensureBuyer, E2E_BUYER } from "./helpers/db";

const authFile = "__tests__/e2e/.auth/buyer.json";

// Sign in once through the real form and persist the session for the other specs.
setup("authenticate as buyer", async ({ page }) => {
  await ensureBuyer();

  await page.goto("/sign-in");
  await page.fill("#email", E2E_BUYER.email);
  await page.fill("#password", E2E_BUYER.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // signInAction redirects a BUYER off the sign-in page on success.
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 30_000 });

  await page.context().storageState({ path: authFile });
});

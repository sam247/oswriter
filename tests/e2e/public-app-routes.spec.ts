import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const MARKETING_BASE_URL = "http://queuewrite.localhost:3000";
const APP_BASE_URL = "http://app.localhost:3000";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await request.post(`${APP_BASE_URL}/api/test/reset`);
});

test("marketing site stays public and routes CTAs to the app host", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("banner").getByRole("navigation");

  await expect(
    page.getByRole("heading", { name: "Run your content operation from one workspace." }),
  ).toBeVisible();

  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", `${APP_BASE_URL}/login`);
  await expect(page.getByRole("link", { name: "Create Your Workspace" }).first()).toHaveAttribute("href", `${APP_BASE_URL}/signup`);

  await nav.getByRole("link", { name: "Platform" }).click();
  await expect(page).toHaveURL(`${MARKETING_BASE_URL}/features`);

  await nav.getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(`${MARKETING_BASE_URL}/pricing`);

  await nav.getByRole("link", { name: "Contact" }).click();
  await expect(page).toHaveURL(`${MARKETING_BASE_URL}/contact`);

  await nav.getByRole("link", { name: "Blog" }).click();
  await expect(page).toHaveURL(`${MARKETING_BASE_URL}/blog`);
});

test("signup sends an OTP and opens the workspace on the app host", async ({ page, request }) => {
  const email = "new-user@example.com";

  await page.goto(`${APP_BASE_URL}/signup`);
  await page.getByLabel("Email").fill(email);
  const code = await requestCode(page, "Send signup code");
  await expect(page).toHaveURL(new RegExp(`${APP_BASE_URL}/verify\\?`));
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify code" }).click();

  await expect(page).toHaveURL(`${APP_BASE_URL}/`);
  await expect(page.getByTitle("Global search")).toBeVisible();

  await page.goto(`${APP_BASE_URL}/settings/billing`);
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await page.getByRole("link", { name: "Back to workspace" }).click();
  await expect(page).toHaveURL(`${APP_BASE_URL}/`);
  await expect(page.getByTitle("Global search")).toBeVisible();
});

test("returning users receive a login OTP and marketing host never serves the app shell", async ({ page, request }) => {
  const email = "returning-user@example.com";

  await signup(page, email);
  await logout(page);

  await page.goto(`${MARKETING_BASE_URL}/login`);
  await expect(page).toHaveURL(`${APP_BASE_URL}/login`);

  await page.getByLabel("Email").fill(email);
  const code = await requestCode(page, "Send sign-in code");
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify code" }).click();

  await expect(page).toHaveURL(`${APP_BASE_URL}/`);
  await expect(page.getByTitle("Global search")).toBeVisible();
});

async function signup(page: Page, email: string) {
  await page.goto(`${APP_BASE_URL}/signup`);
  await page.getByLabel("Email").fill(email);
  const code = await requestCode(page, "Send signup code");
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByTitle("Global search")).toBeVisible();
}

async function logout(page: Page) {
  await page.evaluate(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
  });
}

async function requestCode(page: Page, buttonLabel: string) {
  const responsePromise = page.waitForResponse((response) =>
    response.url() === `${APP_BASE_URL}/api/auth/request-code` && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: buttonLabel }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { testCode?: string };
  expect(payload.testCode).toBeTruthy();
  return payload.testCode ?? "";
}

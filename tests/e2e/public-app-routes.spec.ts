import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/dashboard");
  await expect(
    page.getByText("Enter the workspace password to open the production queue."),
  ).toBeVisible();
  await page.locator('input[type="password"]').fill("oswriter");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByTitle("Global search")).toBeVisible();
}

test("public marketing routes render and navigate", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("banner").getByRole("navigation");

  await expect(
    page.getByRole("heading", {
      name: "Run your content operation from one workspace.",
    }),
  ).toBeVisible();

  await nav.getByRole("link", { name: "Platform" }).click();
  await expect(page).toHaveURL("/features");
  await expect(
    page.getByRole("heading", {
      name: "One workflow. From sitemap to published article.",
    }),
  ).toBeVisible();

  await nav.getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL("/pricing");
  await expect(
    page.getByRole("heading", {
      name: "Priced around the workflow, not the tokens.",
    }),
  ).toBeVisible();

  await nav.getByRole("link", { name: "Contact" }).click();
  await expect(page).toHaveURL("/contact");
  await expect(
    page.getByRole("heading", {
      name: "Talk to the right team, faster.",
    }),
  ).toBeVisible();

  await nav.getByRole("link", { name: "Blog" }).click();
  await expect(page).toHaveURL("/blog");
  await expect(
    page.getByRole("heading", {
      name: "Field notes on content operations.",
    }),
  ).toBeVisible();
});

test("blog article route is publicly available", async ({ page }) => {
  await page.goto("/blog");
  await page
    .getByRole("link", {
      name: /Why AI Writers Fail at Large-Scale Content Operations/i,
    })
    .click();

  await expect(page).toHaveURL(
    "/blog/why-ai-writers-fail-at-large-scale-content-operations",
  );
  await expect(
    page.getByRole("heading", {
      name: "Why AI Writers Fail at Large-Scale Content Operations",
    }),
  ).toBeVisible();
});

test("dashboard stays protected and billing remains protected", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByText("Enter the workspace password to open the production queue."),
  ).toBeVisible();

  await page.goto("/settings/billing");
  await expect(page).toHaveURL("/dashboard");
  await expect(
    page.getByText("Enter the workspace password to open the production queue."),
  ).toBeVisible();
});

test("authenticated users can reach billing and return to the workspace", async ({
  page,
}) => {
  await login(page);

  await page.goto("/settings/billing");
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();

  await page.getByRole("link", { name: "Back to workspace" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByTitle("Global search")).toBeVisible();
});

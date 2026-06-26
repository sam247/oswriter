import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://queuewrite.localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "ENABLE_TEST_API=1 STORAGE_BACKEND=memory AUTH_BACKEND=memory MAIL_BACKEND=memory NEXT_PUBLIC_MARKETING_URL=http://queuewrite.localhost:3000 NEXT_PUBLIC_APP_URL=http://app.localhost:3000 npm run dev -- --hostname 0.0.0.0 --port 3000",
    url: "http://queuewrite.localhost:3000",
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
    },
  ],
  reporter: "html",
  retries: process.env.CI ? 2 : 0,
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    navigationTimeout: 60_000,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    // Emails go to a stand-in for Resend that the tests run (see e2e/helpers.ts)
    env: {
      CRON_SECRET: "e2e-cron-secret",
      RESEND_API_KEY: "e2e-resend-key",
      RESEND_API_URL: "http://localhost:4010",
      RESEND_FROM: "Procmation <noreply@example.com>",
      // File attachments go to a stand-in for S3 that the tests run
      // (see e2e/fake-s3.ts)
      S3_ACCESS_KEY_ID: "e2e-access-key",
      S3_BUCKET: "e2e-bucket",
      S3_ENDPOINT: "http://localhost:4011",
      S3_SECRET_ACCESS_KEY: "e2e-secret-key",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://localhost:3000",
  },
  workers: process.env.CI ? 1 : undefined,
});

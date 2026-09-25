import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.mjs",
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:43168",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node tests/ui-server.mjs",
    url: "http://127.0.0.1:43168/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
  reporter: [["list"]],
});

import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./browser-tests",
  outputDir: "./test-results",
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:8765",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "python -m http.server 8765 --bind 127.0.0.1 --directory site",
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: "http://127.0.0.1:8765/workbench.html",
    reuseExistingServer: !process.env.CI,
  },
});

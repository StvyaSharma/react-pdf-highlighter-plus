import { defineConfig } from "@playwright/test";

const deployedURL = process.env.EPUB_DEMO_URL;
export default defineConfig({
  testDir: "./tests/demo",
  fullyParallel: true,
  workers: 3,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: deployedURL || "http://localhost:4175",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: deployedURL
    ? undefined
    : {
        command:
          "npm run build:cloudflare && npx vite preview --config example/vite.config.ts --outDir dist/cloudflare --port 4175 --strictPort",
        url: "http://localhost:4175",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});

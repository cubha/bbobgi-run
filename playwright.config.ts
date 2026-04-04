import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 360_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://127.0.0.1:5174',
    headless: true,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npx vite --port 5174 --host 127.0.0.1',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});

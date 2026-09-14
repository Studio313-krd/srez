import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1, retries: 0, timeout: 45000,
  use: {baseURL: 'http://127.0.0.1:8087', channel: 'chrome', headless: true, viewport: {width: 1600, height: 1100}},
  reporter: [['list']], outputDir: '.local/browser-results',
});

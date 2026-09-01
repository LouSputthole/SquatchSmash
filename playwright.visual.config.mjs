import { defineConfig } from 'playwright/test';

import { discoverChromium } from './tools/launch-chromium.mjs';

const PORT = Number(process.env.SQUATCH_VISUAL_PORT) || 54961;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM || discoverChromium() || undefined;
const node = JSON.stringify(process.execPath);

export default defineConfig({
  testDir: './tests/visual',
  testMatch: '**/*.visual.spec.mjs',
  snapshotPathTemplate: '{testDir}/visual-baselines/{arg}{ext}',
  outputDir: 'artifacts/visual-regression/test-results',
  fullyParallel: false,
  workers: 1,
  /* One clean retry on CI only: the scheduled runner has lost a staging
   * click to a 30 s locator timeout while every shot compares deterministic
   * (scheduled run 33488181465). A retry re-stages the whole test; the
   * pixel comparison itself stays byte-exact and unforgiving. */
  retries: process.env.CI ? 1 : 0,
  timeout: 240_000,
  expect: {
    timeout: 30_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      threshold: 0.18,
      maxDiffPixelRatio: 0.005,
    },
  },
  reporter: [
    ['line'],
    ['html', { outputFolder: 'artifacts/visual-regression/report', open: 'never' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'America/Chicago',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    actionTimeout: 30_000,
    navigationTimeout: 180_000,
    launchOptions: {
      executablePath,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
        '--force-color-profile=srgb',
      ],
    },
  },
  webServer: {
    command: `${node} tools/serve.mjs`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    env: { ...process.env, PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

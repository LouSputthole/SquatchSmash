import fs from 'node:fs';
import path from 'node:path';

/**
 * PLAYWRIGHT IS IMPORTED WHEN A BROWSER IS LAUNCHED, NOT WHEN THIS IS READ.
 *
 * It used to be a static `import { chromium } from 'playwright'`, and that
 * one line broke the Pages deploy on 2026-08-24. The workflow runs `npm test`
 * with NO dependency install -- the whole suite is deliberately dependency-
 * free, which is why the game vendors three.js -- so `playwright` is simply
 * not on the runner. Two of the new certification tests
 * (semantic-smoke-browser, persisted-checkpoint-liveness) import this module
 * for its case tables and never launch anything, but a static import is
 * resolved before a single line of either file runs. They failed with
 * ERR_MODULE_NOT_FOUND, `npm test` exited 1, and three consecutive deploys
 * never reached the staging step -- so the site kept serving the build from
 * before the cabin and the luxury apartment existed.
 *
 * Deferring the import to the one function that needs a browser makes reading
 * this module free. Anything that actually launches still needs the package
 * and still fails loudly if it is missing, which is the behaviour every
 * `tools/verify-*.mjs` already has.
 */
async function chromiumApi() {
  const { chromium } = await import('playwright');
  return chromium;
}

/**
 * Launch the Chromium Playwright can actually find on this machine.
 *
 * Playwright pins an exact browser revision and refuses to start if the
 * installed build does not match — which is what happens on a container whose
 * browser cache was baked against a different Playwright than the one in
 * `node_modules`. There is no network in here to `npx playwright install` with,
 * so rather than have every browser gate die on a version number, fall back to
 * whatever Chromium is actually present under the browsers path.
 *
 * The default is always tried first, so a correctly provisioned machine gets
 * the pinned build and nothing about this changes.
 */
function discoverChromium() {
  if (process.platform === 'win32') {
    const windowsCandidates = [
      path.join(process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.PROGRAMFILES ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
    const installed = windowsCandidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (installed) return installed;
  }
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    path.join(process.env.HOME ?? '/root', '.cache', 'ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const builds = fs.readdirSync(root)
      .filter((name) => name.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const build of builds) {
      for (const candidate of [
        path.join(root, build, 'chrome-linux', 'chrome'),
        path.join(root, build, 'chrome-linux', 'headless_shell'),
        path.join(root, build, 'chrome-win', 'chrome.exe'),
        path.join(root, build, 'chrome-win64', 'chrome.exe'),
      ]) {
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

export async function launchChromium(options = {}) {
  const chromium = await chromiumApi();
  try {
    return await chromium.launch(options);
  } catch (error) {
    const executablePath = discoverChromium();
    if (!executablePath) throw error;
    console.log(`  note  Playwright's pinned Chromium is missing; using ${executablePath}`);
    return chromium.launch({ ...options, executablePath });
  }
}
